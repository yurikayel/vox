"""Limite de taxa por IP para o relay (token bucket em memória, só biblioteca padrão).

Cada classe de endpoint tem a sua política (`per_min` fichas por minuto, no máximo `burst` guardadas):

| Classe       | O que limita                                              | Padrão (por min / rajada) |
| ------------ | --------------------------------------------------------- | ------------------------- |
| `mailbox`    | POST/DELETE em `/inbox`, `/memory/*`, `/relay/*`          | 120 / 60                  |
| `beacon`     | POST em `/peer/beacon` e `/p2p/seed` (DELETE incluso)     | 60 / 30                   |
| `write`      | demais POST/DELETE (espelho, OAuth, rota desconhecida)    | 60 / 30                   |
| `signal`     | novas conexões WebSocket da sinalização                   | 30 / 15                   |
| `signal_msg` | mensagens de uma conexão WebSocket já aberta              | 600 / 200                 |

Leituras (GET/HEAD/OPTIONS), `/ping` e `/status` ficam de fora. Cada valor muda por variável de ambiente
`VOX_RELAY_RATE_<CLASSE>_PER_MIN` e `VOX_RELAY_RATE_<CLASSE>_BURST` (ex.: `VOX_RELAY_RATE_MAILBOX_PER_MIN=300`).
`VOX_RELAY_WRITE_LIMIT_PER_MIN` (do PM-94) continua valendo como `per_min` das três classes HTTP de escrita.

**IP atrás de proxy:** por padrão vale o IP do socket. `VOX_RELAY_TRUST_PROXY_HOPS=N` (N ≥ 1) manda confiar em
`X-Forwarded-For` e usar a N-ésima entrada contando da direita (cada proxy confiável acrescenta o IP de quem falou
com ele; o que o cliente mandou fica à esquerda e não conta). Valor que não é IP cai no IP do socket.

**Memória:** o mapa guarda um bucket por (classe, IP). Bucket já cheio equivale a bucket inexistente, então sai do
mapa; há ainda um teto de `MAX_ENTRIES` por classe (descarta o mais antigo). IPv6 conta por /64.
"""

import ipaddress
import math
import os
import threading
import time
from collections import OrderedDict, namedtuple

Policy = namedtuple("Policy", "per_min burst")

DEFAULT_POLICIES = {
    "mailbox": Policy(120, 60),
    "beacon": Policy(60, 30),
    "write": Policy(60, 30),
    "signal": Policy(30, 15),
    "signal_msg": Policy(600, 200),
}
LEGACY_WRITE_CLASSES = ("mailbox", "beacon", "write")
MAX_ENTRIES = 20000
MAILBOX_PREFIXES = ("/inbox", "/memory/", "/relay/")
BEACON_PREFIXES = ("/peer/beacon", "/p2p/seed")
WRITE_METHODS = ("POST", "DELETE")
LIMITED_MESSAGE = "Muitas escritas deste endereço; tente de novo em instantes"


def _positive_int(raw, fallback):
    text = str(raw or "").strip()
    return int(text) if text.isdigit() and int(text) > 0 else fallback


def policies_from_env(env=None):
    """Políticas padrão com as variáveis de ambiente por cima; valor inválido ou zero mantém o padrão."""
    env = os.environ if env is None else env
    legacy = _positive_int(env.get("VOX_RELAY_WRITE_LIMIT_PER_MIN"), None)
    policies = {}
    for name, default in DEFAULT_POLICIES.items():
        base = legacy if (legacy and name in LEGACY_WRITE_CLASSES) else default.per_min
        per_min = _positive_int(env.get(f"VOX_RELAY_RATE_{name.upper()}_PER_MIN"), base)
        burst = _positive_int(env.get(f"VOX_RELAY_RATE_{name.upper()}_BURST"), min(default.burst, per_min))
        policies[name] = Policy(per_min, burst)
    return policies


class _Buckets:
    """Buckets de uma classe, do menos para o mais recentemente usado (`OrderedDict`)."""

    def __init__(self, policy, clock, max_entries):
        self.rate = policy.per_min / 60.0
        self.burst = float(policy.burst)
        self.clock = clock
        self.max_entries = max_entries
        self.entries = OrderedDict()
        self.lock = threading.Lock()

    def _refilled(self, tokens, stamp, now):
        return min(self.burst, tokens + (now - stamp) * self.rate)

    def _sweep(self, now):
        """Tira da frente os buckets que já encheram de volta (iguais a um bucket novo)."""
        while self.entries:
            tokens, stamp = next(iter(self.entries.values()))
            if self._refilled(tokens, stamp, now) < self.burst:
                return
            self.entries.popitem(last=False)

    def take(self, key):
        """Gasta uma ficha. Devolve 0 se passou, ou os segundos (arredondados para cima) até ter uma."""
        with self.lock:
            now = self.clock()
            self._sweep(now)
            tokens, stamp = self.entries.pop(key, (self.burst, now))
            tokens = self._refilled(tokens, stamp, now)
            wait = 0 if tokens >= 1 else max(1, math.ceil((1 - tokens) / self.rate))
            self.entries[key] = (tokens - 1 if wait == 0 else tokens, now)
            while len(self.entries) > self.max_entries:
                self.entries.popitem(last=False)
            return wait

    def size(self):
        with self.lock:
            return len(self.entries)


class RateLimiter:
    """Um token bucket por (classe, IP). `check` devolve 0 (liberado) ou os segundos para o `Retry-After`."""

    def __init__(self, policies=None, clock=time.monotonic, max_entries=MAX_ENTRIES):
        chosen = policies if policies is not None else policies_from_env()
        self.buckets = {name: _Buckets(policy, clock, max_entries) for name, policy in chosen.items()}

    def check(self, klass, ip):
        buckets = self.buckets.get(klass)
        return buckets.take(ip) if buckets else 0

    def size(self, klass):
        return self.buckets[klass].size()


LIMITER = RateLimiter()


def write_class(method, path):
    """Classe de limite de um pedido HTTP, ou None para o que não é limitado (leituras, `/ping`, `/status`)."""
    if str(method).upper() not in WRITE_METHODS:
        return None
    route = str(path or "").split("?")[0]
    if route.startswith(BEACON_PREFIXES):
        return "beacon"
    return "mailbox" if route.startswith(MAILBOX_PREFIXES) else "write"


def http_rejection(method, path, ip, limiter=None):
    """`(429, mensagem, retry_after)` se o IP estourou o limite da classe do pedido; None se pode seguir."""
    klass = write_class(method, path)
    if klass is None:
        return None
    wait = (limiter or LIMITER).check(klass, ip)
    return (429, LIMITED_MESSAGE, wait) if wait else None


def trusted_hops(env=None):
    """Quantos proxies confiáveis ficam na frente (0 = ignorar `X-Forwarded-For`)."""
    return _positive_int((os.environ if env is None else env).get("VOX_RELAY_TRUST_PROXY_HOPS"), 0)


TRUSTED_HOPS = trusted_hops()


def _bucket_key(text):
    """IP normalizado (IPv4-mapeado vira IPv4; IPv6 vira o /64), ou None se não for um IP."""
    try:
        address = ipaddress.ip_address(str(text).strip().strip("[]"))
    except ValueError:
        return None
    if address.version == 6 and address.ipv4_mapped:
        return str(address.ipv4_mapped)
    if address.version == 6:
        return str(ipaddress.ip_network(f"{address}/64", strict=False).network_address)
    return str(address)


def client_ip(peer_ip, forwarded_for=None, hops=None):
    """IP que identifica o cliente: o do socket, ou o da N-ésima entrada da direita de `X-Forwarded-For`."""
    hops = TRUSTED_HOPS if hops is None else hops
    entries = [part for part in str(forwarded_for or "").split(",") if part.strip()]
    if hops > 0 and len(entries) >= hops:
        chosen = _bucket_key(entries[-hops])
        if chosen:
            return chosen
    return _bucket_key(peer_ip) or str(peer_ip)
