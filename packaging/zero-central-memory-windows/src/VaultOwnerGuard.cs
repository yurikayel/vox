using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace Vox.ZeroMemory {
    /// <summary>
    /// Cofres de recuperação neste nó, com as mesmas regras do relay Python (`relay/vault_store.py`).
    /// PM-90: só cofre v2 (sal e iterações no envelope) ou a marca de revogado entra e sai daqui.
    /// PM-94: cada cofre tem um dono. O aparelho manda `ownerToken` (32 bytes em hex, derivados da Senha Soberana);
    /// o nó guarda só o SHA-256 (`ownerHash`) e passa a exigir a mesma prova para regravar. Cofre v2 novo sem prova
    /// é recusado; registro antigo sem dono aceita a primeira gravação com prova.
    /// </summary>
    public sealed partial class MemoryStore {
        public const string VaultSaved = "saved";
        public const string VaultInvalid = "invalid";
        public const string VaultForbidden = "forbidden";
        private const string OwnerField = "ownerHash";

        public Dictionary<string, object> GetVaultRecord(string key) {
            string clean = (key ?? "").Trim().ToLowerInvariant();
            if (!Hex64.IsMatch(clean)) return null;
            lock (syncLock) {
                var record = ReadJsonFile(Path.Combine(vaultsDir, clean + ".json"));
                if (!IsServableVault(record)) return null;
                record.Remove(OwnerField);
                return record;
            }
        }

        public static bool IsServableVault(Dictionary<string, object> record) {
            if (record == null) return false;
            object revoked;
            if (record.TryGetValue("revoked", out revoked) && revoked is bool && (bool)revoked) return true;
            object v, salt, iter;
            if (!record.TryGetValue("v", out v) || !(v is int) || (int)v != 2) return false;
            if (!record.TryGetValue("salt", out salt) || string.IsNullOrEmpty(salt as string)) return false;
            if (!record.TryGetValue("iter", out iter) || !(iter is int)) return false;
            int n = (int)iter;
            return n >= 100000 && n <= 5000000;
        }

        /// <summary>Grava o cofre se a prova do dono confere. Devolve `saved`, `invalid` ou `forbidden`.</summary>
        public string SaveVaultRecord(string key, Dictionary<string, object> record, string ownerToken) {
            string clean = (key ?? "").Trim().ToLowerInvariant();
            if (!Hex64.IsMatch(clean) || !IsServableVault(record)) return VaultInvalid;
            lock (syncLock) {
                EnsureDirs();
                Directory.CreateDirectory(vaultsDir);
                string filePath = Path.Combine(vaultsDir, clean + ".json");
                string owner;
                string status = AuthorizeVaultWrite(ReadJsonFile(filePath), record, ownerToken, out owner);
                if (status != VaultSaved) return status;
                var stored = new Dictionary<string, object>(record);
                stored.Remove(OwnerField);
                if (!string.IsNullOrEmpty(owner)) stored[OwnerField] = owner;
                AtomicWriteBytes(filePath, Encoding.UTF8.GetBytes(CreateSerializer().Serialize(stored)));
                return VaultSaved;
            }
        }

        private static string AuthorizeVaultWrite(Dictionary<string, object> stored, Dictionary<string, object> record, string token, out string owner) {
            owner = null;
            object currentObj = null;
            string current = stored != null && stored.TryGetValue(OwnerField, out currentObj) ? currentObj as string : null;
            string presented = NodeRequestGuard.OwnerHash(token);
            if (!string.IsNullOrEmpty(current)) {
                if (presented == null || !NodeRequestGuard.FixedTimeEquals(presented, current)) return VaultForbidden;
                owner = current;
                return VaultSaved;
            }
            if (token != null && presented == null) return VaultInvalid;
            object revoked;
            bool isRevocation = record.TryGetValue("revoked", out revoked) && revoked is bool && (bool)revoked;
            if (presented == null && !isRevocation) return VaultForbidden;
            owner = presented;
            return VaultSaved;
        }
    }

    /// <summary>Cabeçalhos que o nó lê de cada pedido.</summary>
    public sealed class NodeRequestHeaders {
        public string Token = "";
        public string Host = "";
        public string Origin = "";
        public string ContentType = "";

        public void Read(string line) {
            int colon = line.IndexOf(':');
            if (colon <= 0) return;
            string name = line.Substring(0, colon).Trim().ToLowerInvariant();
            string value = line.Substring(colon + 1).Trim();
            if (name == "x-vox-node-token") Token = value;
            else if (name == "host") Host = value;
            else if (name == "origin") Origin = value;
            else if (name == "content-type") ContentType = value;
        }
    }

    /// <summary>
    /// PM-94 — quem pode falar com o nó, igual ao `relay/request_guard.py`:
    /// Host de loopback (ou o túnel deste nó, ou `VOX_RELAY_ALLOWED_HOSTS`), escrita só das origens do app e
    /// POST só com `application/json`. O nó escuta só em loopback, então não há limite por IP.
    /// </summary>
    public static class NodeRequestGuard {
        private static readonly string[] AppOrigins = { "https://yurikayel.github.io", "https://vox-9df.pages.dev" };
        private static readonly string[] LoopbackNames = { "127.0.0.1", "localhost", "::1" };

        public static string Hostname(string value) {
            string text = (value ?? "").Trim().ToLowerInvariant();
            int scheme = text.IndexOf("://", StringComparison.Ordinal);
            if (scheme >= 0) text = text.Substring(scheme + 3);
            int slash = text.IndexOf('/');
            if (slash >= 0) text = text.Substring(0, slash);
            if (text.StartsWith("[")) {
                int close = text.IndexOf(']');
                return close > 0 ? text.Substring(1, close - 1) : text;
            }
            int colon = text.LastIndexOf(':');
            return colon > 0 && text.IndexOf(':') == colon ? text.Substring(0, colon) : text;
        }

        private static bool IsLoopback(string name) {
            return Array.IndexOf(LoopbackNames, Hostname(name)) >= 0;
        }

        private static bool InEnvList(string name, string value) {
            string raw = Environment.GetEnvironmentVariable(name) ?? "";
            foreach (string item in raw.Split(',')) {
                if (item.Trim().ToLowerInvariant().TrimEnd('/') == value) return true;
            }
            return false;
        }

        public static bool HostAllowed(string host) {
            string name = Hostname(host);
            if (IsLoopback(name) || InEnvList("VOX_RELAY_ALLOWED_HOSTS", name)) return true;
            string tunnel = TunnelManager.CurrentTunnelUrl;
            return !string.IsNullOrEmpty(tunnel) && Hostname(tunnel) == name;
        }

        public static bool OriginAllowed(string origin) {
            string text = (origin ?? "").Trim().ToLowerInvariant().TrimEnd('/');
            if (text.Length == 0) return true;
            if ((text.StartsWith("http://") || text.StartsWith("https://")) && IsLoopback(text)) return true;
            return Array.IndexOf(AppOrigins, text) >= 0 || InEnvList("VOX_RELAY_ALLOWED_ORIGINS", text);
        }

        /// <summary>Status HTTP para recusar o pedido, ou 0 se ele pode seguir.</summary>
        public static int RejectStatus(string method, NodeRequestHeaders headers) {
            if (!HostAllowed(headers.Host)) return 421;
            if (method != "POST" && method != "DELETE") return 0;
            if (!OriginAllowed(headers.Origin)) return 403;
            string mediaType = headers.ContentType.Split(';')[0].Trim().ToLowerInvariant();
            if (method == "POST" && mediaType != "application/json") return 415;
            return 0;
        }

        public static string OwnerHash(string token) {
            string text = (token ?? "").Trim().ToLowerInvariant();
            if (text.Length != 64) return null;
            var raw = new byte[32];
            for (int i = 0; i < 32; i++) {
                if (!IsHexPair(text, i * 2)) return null;
                raw[i] = Convert.ToByte(text.Substring(i * 2, 2), 16);
            }
            using (var sha = SHA256.Create()) {
                var sb = new StringBuilder();
                foreach (byte b in sha.ComputeHash(raw)) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private static bool IsHexPair(string text, int at) {
            return Uri.IsHexDigit(text[at]) && Uri.IsHexDigit(text[at + 1]);
        }

        public static bool FixedTimeEquals(string a, string b) {
            if (a == null || b == null || a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }
    }
}
