FROM python:3.15-alpine

WORKDIR /app

# Layout de pacote: server.py faz `from relay import ...`, então os módulos
# ficam em /app/relay/ (namespace package) e /app entra no PYTHONPATH.
# O contexto de build é a pasta relay/ (Render, HF, compose). Os test_*.py ficam
# de fora via relay/.dockerignore. Zero dependências pip.
COPY *.py ./relay/
ENV PYTHONPATH=/app

# Dados graváveis só nestes diretórios (cache e inbox). Dono: usuário `vox`, não-root (uid fixo 10001).
# Sem isso, o processo não consegue criar os diretórios padrão dentro de /app/relay/.
RUN addgroup -S -g 10001 vox \
 && adduser -S -D -H -u 10001 -G vox vox \
 && mkdir -p /app/.cache /app/.inbox \
 && chown -R vox:vox /app/.cache /app/.inbox
ENV VOX_RELAY_CACHE_DIR=/app/.cache \
    VOX_RELAY_INBOX_DIR=/app/.inbox
VOLUME ["/app/.cache", "/app/.inbox"]

# Porta padrão para instâncias gratuitas em nuvem (7860 para HF Spaces; Koyeb e Render injetam $PORT)
ENV PORT=7860
EXPOSE 7860 3921 3920

# Healthcheck com stdlib (zero pip). Usa a porta do ambiente: a sinalização responde em /health.
# O compose sobrescreve esta checagem por serviço (relay usa 3920).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT','3921'),timeout=4)" || exit 1

USER vox

# Padrão: só a sinalização WebRTC (nó público). O bind 0.0.0.0 é DENTRO do contêiner, para que a
# porta seja alcançável pelo mapeamento do Docker; quem decide a exposição no host é o compose
# (127.0.0.1 por padrão) ou a plataforma. O relay completo roda com
# `python -u -m relay.server --host 0.0.0.0 --port 3920` (ver relay/deploy/docker-compose.yml).
CMD ["python", "-u", "relay/signaling.py", "--host", "0.0.0.0"]
