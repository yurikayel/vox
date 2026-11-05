using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Vox Populi • Zero-Central-Memory (Dev Alpha/Beta)")]
[assembly: AssemblyDescription("Vox Populi Dev Node — Sustentação de Memória Central para Alpha e Beta")]
[assembly: AssemblyCompany("Vox Populi")]
[assembly: AssemblyProduct("VoxPopuli Node Zero - Community Node")]
[assembly: AssemblyVersion("0.5.0.0")]
[assembly: AssemblyFileVersion("0.5.0.0")]

namespace Vox.ZeroMemory {
    public sealed class MemoryStore {
        private static readonly Regex Hex64 = new Regex("^[0-9a-fA-F]{64}$", RegexOptions.Compiled);
        private static readonly Regex SafeId = new Regex("^[A-Za-z0-9._:-]{1,160}$", RegexOptions.Compiled);
        private static readonly Regex TxIdRegex = new Regex("^[A-Za-z0-9_-]{43}$", RegexOptions.Compiled);
        private readonly object syncLock = new object();
        private readonly string dataDir;
        private readonly string cacheDir;
        private readonly string inboxDir;
        private readonly string memoryDir;
        private readonly string blobsDir;
        private readonly string checkpointsDir;
        private readonly string vaultsDir;
        private readonly string stateFile;
        private readonly string bakFile;
        private readonly string journalFile;
        private readonly string logFile;
        private Dictionary<string, object> state;
        private volatile bool isDirty;
        private System.Threading.Timer batchFlushTimer;

        public MemoryStore(string rootDataDir) {
            dataDir = rootDataDir;
            cacheDir = Path.Combine(rootDataDir, "cache");
            inboxDir = Path.Combine(rootDataDir, "inbox");
            memoryDir = Path.Combine(rootDataDir, "central_memory");
            blobsDir = Path.Combine(memoryDir, "blobs");
            checkpointsDir = Path.Combine(memoryDir, "checkpoints");
            vaultsDir = Path.Combine(memoryDir, "vaults");
            stateFile = Path.Combine(memoryDir, "state.json");
            bakFile = Path.Combine(memoryDir, "state.json.bak");
            journalFile = Path.Combine(memoryDir, "events.jsonl");
            logFile = Path.Combine(rootDataDir, "node-zero.log");
            LoadState(true);
            batchFlushTimer = new System.Threading.Timer(_ => FlushIfDirty(), null, 2000, 2000);
        }

        public string DataDir { get { return dataDir; } }
        public string CacheDir { get { return cacheDir; } }
        public string InboxDir { get { return inboxDir; } }
        public string MemoryDir { get { return memoryDir; } }
        public string LogFile { get { return logFile; } }

        public void WriteLog(string category, string message) {
            try {
                Directory.CreateDirectory(dataDir);
                string line = string.Format("[{0}] [{1}] {2}\r\n",
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), category, message);
                lock (syncLock) {
                    File.AppendAllText(logFile, line, Encoding.UTF8);
                }
            } catch { }
        }

        public static JavaScriptSerializer CreateSerializer() {
            var ser = new JavaScriptSerializer();
            ser.MaxJsonLength = int.MaxValue;
            ser.RecursionLimit = 64;
            return ser;
        }

        public static long NowMs() {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        private void EnsureDirs() {
            Directory.CreateDirectory(memoryDir);
            Directory.CreateDirectory(blobsDir);
            Directory.CreateDirectory(cacheDir);
            Directory.CreateDirectory(inboxDir);
        }

        private static Dictionary<string, object> CreateEmptyState() {
            var s = new Dictionary<string, object>();
            s["version"] = 1;
            s["mode"] = "zero-central-memory";
            s["edition"] = "vox-populi-dev-alpha-beta";
            s["revision"] = 0L;
            s["updatedAt"] = NowMs();
            s["posts"] = new Dictionary<string, object>();
            s["tombstones"] = new Dictionary<string, object>();
            s["profiles"] = new Dictionary<string, object>();
            s["manifests"] = new Dictionary<string, object>();
            s["blobs"] = new Dictionary<string, object>();
            return s;
        }

        private static Dictionary<string, object> ReadJsonFile(string path) {
            if (!File.Exists(path)) return null;
            try {
                string raw = File.ReadAllText(path, Encoding.UTF8);
                return CreateSerializer().Deserialize<Dictionary<string, object>>(raw);
            } catch {
                return null;
            }
        }

        public static Dictionary<string, object> AsDict(object obj) {
            var d = obj as Dictionary<string, object>;
            if (d != null) return d;
            var table = obj as IDictionary;
            if (table == null) return null;
            var copy = new Dictionary<string, object>();
            foreach (DictionaryEntry entry in table) {
                if (entry.Key != null) copy[entry.Key.ToString()] = entry.Value;
            }
            return copy;
        }

        public static long ToLong(object val, long fallback = 0L) {
            if (val == null) return fallback;
            try { return Convert.ToInt64(val); } catch { return fallback; }
        }

        public static string GetStr(Dictionary<string, object> dict, string key) {
            if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return "";
            return dict[key].ToString().Trim();
        }

        private static long ItemTimestamp(Dictionary<string, object> item) {
            if (item == null) return 0L;
            string[] fields = new string[] { "editedAt", "ts", "timestamp", "createdAt", "updatedAt" };
            foreach (string f in fields) {
                if (item.ContainsKey(f)) {
                    long v = ToLong(item[f], 0L);
                    if (v > 0) return v;
                }
            }
            return 0L;
        }

        private static Dictionary<string, object> NormalizeLoaded(Dictionary<string, object> raw) {
            var norm = CreateEmptyState();
            if (raw == null) return norm;
            norm["revision"] = ToLong(raw.ContainsKey("revision") ? raw["revision"] : 0L, 0L);
            norm["updatedAt"] = ToLong(raw.ContainsKey("updatedAt") ? raw["updatedAt"] : NowMs(), NowMs());
            string[] keys = new string[] { "posts", "tombstones", "profiles", "manifests", "blobs" };
            foreach (string k in keys) {
                if (raw.ContainsKey(k)) {
                    var sub = AsDict(raw[k]);
                    if (sub != null) norm[k] = sub;
                }
            }
            if (norm.ContainsKey("profiles")) {
                var profs = norm["profiles"] as Dictionary<string, object>;
                if (profs != null) {
                    var seenGoogle = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    var removeKeys = new List<string>();
                    foreach (var kvp in profs) {
                        var card = AsDict(kvp.Value);
                        if (card == null) continue;
                        string av = GetStr(card, "avatarUrl");
                        if (!string.IsNullOrEmpty(av) && av.Contains("lh3.googleusercontent.com/a/")) {
                            if (seenGoogle.ContainsKey(av)) {
                                removeKeys.Add(kvp.Key);
                            } else {
                                seenGoogle[av] = kvp.Key;
                            }
                        }
                    }
                    foreach (string rk in removeKeys) {
                        profs.Remove(rk);
                    }
                }
            }
            return norm;
        }

        public Dictionary<string, object> LoadState(bool forceReload) {
            lock (syncLock) {
                if (state != null && !forceReload) return state;
                var raw = ReadJsonFile(stateFile);
                bool usedBackup = false;
                if (raw == null && File.Exists(bakFile)) {
                    raw = ReadJsonFile(bakFile);
                    usedBackup = (raw != null);
                }
                state = NormalizeLoaded(raw);
                bool replayed = ReplayJournal();
                if (usedBackup || replayed) SaveState();
                return state;
            }
        }

        private bool ReplayJournal() {
            if (!File.Exists(journalFile)) return false;
            bool changed = false;
            try {
                foreach (string line in File.ReadAllLines(journalFile, Encoding.UTF8)) {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var evt = CreateSerializer().Deserialize<Dictionary<string, object>>(line);
                    if (ApplyEventInternal(evt)) changed = true;
                }
            } catch { }
            return changed;
        }

        public static void AtomicWriteBytes(string targetPath, byte[] data) {
            string dir = Path.GetDirectoryName(targetPath);
            Directory.CreateDirectory(dir);
            string tmp = Path.Combine(dir, ".mem-" + Guid.NewGuid().ToString("N") + ".tmp");
            using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) {
                fs.Write(data, 0, data.Length);
                fs.Flush(true);
            }
            if (File.Exists(targetPath)) {
                File.Copy(tmp, targetPath, true);
                File.Delete(tmp);
            } else {
                File.Move(tmp, targetPath);
            }
        }

        private void AppendJournal(Dictionary<string, object> evt) {
            try {
                EnsureDirs();
                string line = CreateSerializer().Serialize(evt) + "\n";
                byte[] bytes = Encoding.UTF8.GetBytes(line);
                using (var fs = new FileStream(journalFile, FileMode.Append, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough)) {
                    fs.Write(bytes, 0, bytes.Length);
                    fs.Flush(true);
                }
            } catch { }
        }

        public void FlushIfDirty() {
            if (!isDirty) return;
            SaveState();
        }

        public void SaveState() {
            lock (syncLock) {
                EnsureDirs();
                isDirty = false;
                state["updatedAt"] = NowMs();
                byte[] encoded = Encoding.UTF8.GetBytes(CreateSerializer().Serialize(state));
                if (File.Exists(stateFile)) {
                    try { AtomicWriteBytes(bakFile, File.ReadAllBytes(stateFile)); } catch { }
                }
                AtomicWriteBytes(stateFile, encoded);
                if (File.Exists(journalFile)) {
                    try { File.Delete(journalFile); } catch { }
                }
            }
        }

        public string SaveDatedCheckpoint() {
            lock (syncLock) {
                SaveState();
                Directory.CreateDirectory(checkpointsDir);
                string fileName = "state-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".json";
                string target = Path.Combine(checkpointsDir, fileName);
                if (File.Exists(stateFile)) {
                    File.Copy(stateFile, target, true);
                }
                return target;
            }
        }

        public string GetDashboardHtml() {
            string[] candidates = new string[] {
                Path.Combine(dataDir, "dashboard.html"),
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dashboard.html"),
                Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "", "dashboard.html"),
                @"C:\project\politica\vox\tools\dashboard.html",
                @"C:\project\politica\vox\dist\dashboard.html"
            };
            foreach (string p in candidates) {
                try {
                    if (File.Exists(p)) return File.ReadAllText(p, Encoding.UTF8);
                } catch { }
            }
            return "<!DOCTYPE html><html><body><h2>Vox Populi • Dashboard</h2><p>dashboard.html não localizado nos caminhos padrão.</p></body></html>";
        }

        public List<string> GetRecentLogs(int maxLines = 150) {
            var list = new List<string>();
            try {
                if (!File.Exists(logFile)) return list;
                lock (syncLock) {
                    using (var fs = new FileStream(logFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    using (var reader = new StreamReader(fs, Encoding.UTF8)) {
                        var all = new List<string>();
                        string line;
                        while ((line = reader.ReadLine()) != null) {
                            if (!string.IsNullOrEmpty(line)) all.Add(line);
                        }
                        int start = Math.Max(0, all.Count - maxLines);
                        for (int i = start; i < all.Count; i++) list.Add(all[i]);
                    }
                }
            } catch { }
            return list;
        }

        private void BumpRevision() {
            state["revision"] = ToLong(state["revision"], 0L) + 1L;
        }

        private bool ApplyPost(Dictionary<string, object> item) {
            if (item == null) return false;
            string id = GetStr(item, "id");
            if (!SafeId.IsMatch(id)) return false;
            string type = GetStr(item, "type");
            string kind = GetStr(item, "kind");
            if (type == "tombstone" || type == "post-tombstone" || kind == "post-tombstone") return ApplyTombstone(item);
            if (type == "profile-card") return ApplyProfile(item);
            if (type == "cache-manifest") return ApplyManifest(item);

            var posts = (Dictionary<string, object>)state["posts"];
            var tombs = (Dictionary<string, object>)state["tombstones"];
            long inTs = ItemTimestamp(item);
            if (tombs.ContainsKey(id) && ItemTimestamp(AsDict(tombs[id])) >= inTs && inTs > 0) return false;
            if (posts.ContainsKey(id)) {
                var ex = AsDict(posts[id]);
                if (ex != null) {
                    string exAuthor = GetStr(ex, "author");
                    string inAuthor = GetStr(item, "author");
                    if (!string.IsNullOrEmpty(exAuthor) && !string.IsNullOrEmpty(inAuthor) && exAuthor != inAuthor) return false;
                    if (ItemTimestamp(ex) >= inTs && inTs > 0) return false;
                }
            }
            posts[id] = item;
            string postAuthor = GetStr(item, "author");
            if (string.IsNullOrEmpty(postAuthor)) postAuthor = GetStr(item, "owner");
            if (postAuthor.StartsWith("vx_") && SafeId.IsMatch(postAuthor)) {
                var profiles = (Dictionary<string, object>)state["profiles"];
                if (!profiles.ContainsKey(postAuthor)) {
                    var autoCard = new Dictionary<string, object>();
                    autoCard["routeId"] = postAuthor;
                    autoCard["name"] = GetStr(item, "authorDisplay");
                    autoCard["avatarUrl"] = GetStr(item, "authorAvatar");
                    autoCard["handle"] = GetStr(item, "authorHandle");
                    autoCard["discoverable"] = true;
                    autoCard["updatedAt"] = inTs > 0 ? inTs : NowMs();
                    profiles[postAuthor] = autoCard;
                }
            }
            BumpRevision();
            return true;
        }

        private bool ApplyTombstone(Dictionary<string, object> tomb) {
            if (tomb == null) return false;
            string id = GetStr(tomb, "id");
            if (!SafeId.IsMatch(id)) return false;
            long delTs = ItemTimestamp(tomb);
            if (delTs <= 0) delTs = NowMs();

            var posts = (Dictionary<string, object>)state["posts"];
            var tombs = (Dictionary<string, object>)state["tombstones"];
            if (tombs.ContainsKey(id) && ItemTimestamp(AsDict(tombs[id])) >= delTs) return false;

            tomb["id"] = id;
            tomb["type"] = "tombstone";
            tomb["editedAt"] = delTs;
            tombs[id] = tomb;
            if (posts.ContainsKey(id)) posts.Remove(id);
            BumpRevision();
            return true;
        }

        private bool ApplyProfile(Dictionary<string, object> card) {
            if (card == null) return false;
            string routeId = GetStr(card, "routeId");
            if (string.IsNullOrEmpty(routeId)) routeId = GetStr(card, "author");
            if (string.IsNullOrEmpty(routeId)) routeId = GetStr(card, "id");
            if (!SafeId.IsMatch(routeId)) return false;

            var profiles = (Dictionary<string, object>)state["profiles"];
            long inTs = ItemTimestamp(card);
            string inName = GetStr(card, "name");
            if (string.IsNullOrEmpty(inName)) inName = GetStr(card, "displayName");
            if (profiles.ContainsKey(routeId)) {
                var ex = AsDict(profiles[routeId]);
                if (ex != null) {
                    string exName = GetStr(ex, "name");
                    if (string.IsNullOrEmpty(exName)) exName = GetStr(ex, "displayName");
                    bool sameMeta = (exName == inName) &&
                                    (GetStr(ex, "avatarUrl") == GetStr(card, "avatarUrl")) &&
                                    (GetStr(ex, "bio") == GetStr(card, "bio")) &&
                                    (GetStr(ex, "handle") == GetStr(card, "handle"));
                    if (sameMeta) return false;
                    if (string.IsNullOrEmpty(inName) && !string.IsNullOrEmpty(exName)) {
                        card["name"] = exName;
                    }
                }
            }
            if (!string.IsNullOrEmpty(inName)) card["name"] = inName;
            string inAvatar = GetStr(card, "avatarUrl");
            if (!string.IsNullOrEmpty(inAvatar) && inAvatar.Contains("lh3.googleusercontent.com/a/")) {
                var toRemove = new List<string>();
                foreach (var kvp in profiles) {
                    if (kvp.Key != routeId) {
                        var exCard = AsDict(kvp.Value);
                        if (exCard != null && GetStr(exCard, "avatarUrl") == inAvatar) {
                            toRemove.Add(kvp.Key);
                        }
                    }
                }
                foreach (string dupId in toRemove) {
                    profiles.Remove(dupId);
                }
            }
            card["routeId"] = routeId;
            profiles[routeId] = card;
            BumpRevision();
            return true;
        }

        private bool ApplyManifest(Dictionary<string, object> manifest) {
            if (manifest == null) return false;
            string commId = GetStr(manifest, "communityId");
            if (string.IsNullOrEmpty(commId)) commId = GetStr(manifest, "id");
            if (!SafeId.IsMatch(commId)) return false;
            var manifests = (Dictionary<string, object>)state["manifests"];
            manifests[commId] = manifest;
            BumpRevision();
            return true;
        }

        private bool ApplyBlob(Dictionary<string, object> blob) {
            if (blob == null) return false;
            string hash = GetStr(blob, "hash").ToLowerInvariant();
            string data = GetStr(blob, "data");
            if (!Hex64.IsMatch(hash) || string.IsNullOrEmpty(data)) return false;

            var blobs = (Dictionary<string, object>)state["blobs"];
            string blobPath = Path.Combine(blobsDir, hash + ".json");
            if (File.Exists(blobPath) && blobs.ContainsKey(hash)) return false;

            var record = new Dictionary<string, object>();
            record["hash"] = hash;
            record["mime"] = string.IsNullOrEmpty(GetStr(blob, "mime")) ? "application/octet-stream" : GetStr(blob, "mime");
            record["byteLength"] = ToLong(blob.ContainsKey("byteLength") ? blob["byteLength"] : data.Length, data.Length);
            record["data"] = data;
            AtomicWriteBytes(blobPath, Encoding.UTF8.GetBytes(CreateSerializer().Serialize(record)));

            var meta = new Dictionary<string, object>();
            meta["hash"] = hash;
            meta["mime"] = record["mime"];
            meta["byteLength"] = record["byteLength"];
            meta["storedAt"] = NowMs();
            blobs[hash] = meta;
            BumpRevision();
            return true;
        }

        public Dictionary<string, object> GetBlob(string hash) {
            string clean = (hash ?? "").Trim().ToLowerInvariant();
            if (!Hex64.IsMatch(clean)) return null;
            lock (syncLock) {
                return ReadJsonFile(Path.Combine(blobsDir, clean + ".json"));
            }
        }

        public Dictionary<string, object> GetVaultRecord(string key) {
            string clean = (key ?? "").Trim().ToLowerInvariant();
            if (!Hex64.IsMatch(clean)) return null;
            lock (syncLock) {
                return ReadJsonFile(Path.Combine(vaultsDir, clean + ".json"));
            }
        }

        public bool SaveVaultRecord(string key, Dictionary<string, object> payload) {
            string clean = (key ?? "").Trim().ToLowerInvariant();
            if (!Hex64.IsMatch(clean) || payload == null) return false;
            lock (syncLock) {
                EnsureDirs();
                Directory.CreateDirectory(vaultsDir);
                string filePath = Path.Combine(vaultsDir, clean + ".json");
                AtomicWriteBytes(filePath, Encoding.UTF8.GetBytes(CreateSerializer().Serialize(payload)));
                return true;
            }
        }

        private bool ApplyEventInternal(Dictionary<string, object> payload) {
            if (payload == null) return false;
            string etype = GetStr(payload, "type").ToUpperInvariant();
            if (etype == "GOSSIP" || etype == "GOSSIP_UPDATE") {
                return ApplyPost(AsDict(payload.ContainsKey("item") ? payload["item"] : null));
            }
            if (etype == "GOSSIP_DELETE") {
                var target = AsDict(payload.ContainsKey("tombstone") ? payload["tombstone"] : (payload.ContainsKey("item") ? payload["item"] : null));
                return ApplyTombstone(target);
            }
            if (etype == "PROFILE_CARD_HELLO" || etype == "PROFILE_CARD") {
                var card = AsDict(payload.ContainsKey("card") ? payload["card"] : (payload.ContainsKey("item") ? payload["item"] : payload));
                return ApplyProfile(card);
            }
            if (etype == "CACHE_MANIFEST") {
                var m = AsDict(payload.ContainsKey("item") ? payload["item"] : (payload.ContainsKey("manifest") ? payload["manifest"] : payload));
                return ApplyManifest(m);
            }
            if (etype == "MEDIA_BLOB") {
                var b = AsDict(payload.ContainsKey("blob") ? payload["blob"] : payload);
                return ApplyBlob(b);
            }
            if (payload.ContainsKey("hash") && payload.ContainsKey("data")) return ApplyBlob(payload);
            if (payload.ContainsKey("id")) return ApplyPost(payload);
            return false;
        }

        public Dictionary<string, object> IngestEvent(Dictionary<string, object> payload) {
            lock (syncLock) {
                bool changed = ApplyEventInternal(payload);
                if (changed) {
                    state["updatedAt"] = NowMs();
                    AppendJournal(payload);
                    isDirty = true;
                    if (!File.Exists(stateFile)) SaveState();
                    WriteLog("INGEST", string.Format("type={0} saved -> rev=#{1}", GetStr(payload, "type"), state["revision"]));
                }
                var res = new Dictionary<string, object>();
                res["status"] = changed ? "saved" : "unchanged";
                res["changed"] = changed;
                res["revision"] = state["revision"];
                res["counts"] = GetCounts();
                return res;
            }
        }

        private int IngestList(object rawList, Func<Dictionary<string, object>, bool> fn) {
            var enumerable = rawList as IEnumerable;
            if (enumerable == null) return 0;
            int count = 0;
            foreach (object obj in enumerable) {
                var d = AsDict(obj);
                if (d != null && fn(d)) count++;
            }
            return count;
        }

        private static HashSet<string> ParseKnownBlobs(Dictionary<string, object> payload) {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (payload == null || !payload.ContainsKey("knownBlobs")) return set;
            var list = payload["knownBlobs"] as IEnumerable;
            if (list == null) return set;
            foreach (object item in list) {
                if (item != null) set.Add(item.ToString().Trim().ToLowerInvariant());
            }
            return set;
        }

        public Dictionary<string, object> SyncBundle(Dictionary<string, object> payload) {
            lock (syncLock) {
                long clientRev = (payload != null && payload.ContainsKey("clientRevision")) ? ToLong(payload["clientRevision"], 0L) : 0L;
                long since = (payload != null && payload.ContainsKey("since")) ? ToLong(payload["since"], 0L) : 0L;
                int changes = 0;
                if (payload != null) {
                    if (payload.ContainsKey("tombstones")) changes += IngestList(payload["tombstones"], ApplyTombstone);
                    if (payload.ContainsKey("posts")) changes += IngestList(payload["posts"], ApplyPost);
                    if (payload.ContainsKey("profiles")) changes += IngestList(payload["profiles"], ApplyProfile);
                    if (payload.ContainsKey("manifests")) changes += IngestList(payload["manifests"], ApplyManifest);
                    if (payload.ContainsKey("blobs")) changes += IngestList(payload["blobs"], ApplyBlob);
                }
                if (changes > 0) {
                    state["updatedAt"] = NowMs();
                    isDirty = true;
                    if (!File.Exists(stateFile)) SaveState();
                    WriteLog("SYNC", string.Format("+{0} itens sincronizados -> rev=#{1}", changes, state["revision"]));
                }
                long currentRev = ToLong(state["revision"], 0L);
                if (changes == 0 && clientRev > 0 && clientRev == currentRev) {
                    var fast = GetStatusSummary();
                    fast["upToDate"] = true;
                    fast["ingestedCount"] = 0;
                    fast["posts"] = new List<object>();
                    fast["tombstones"] = new List<object>();
                    fast["profiles"] = new List<object>();
                    fast["manifests"] = new List<object>();
                    fast["blobs"] = new List<object>();
                    return fast;
                }
                var exported = ExportState(true, since, ParseKnownBlobs(payload));
                exported["ingestedCount"] = changes;
                return exported;
            }
        }

        public Dictionary<string, int> GetCounts() {
            lock (syncLock) {
                var c = new Dictionary<string, int>();
                c["posts"] = ((Dictionary<string, object>)state["posts"]).Count;
                c["tombstones"] = ((Dictionary<string, object>)state["tombstones"]).Count;
                c["profiles"] = ((Dictionary<string, object>)state["profiles"]).Count;
                c["manifests"] = ((Dictionary<string, object>)state["manifests"]).Count;
                c["blobs"] = ((Dictionary<string, object>)state["blobs"]).Count;
                return c;
            }
        }

        public Dictionary<string, object> GetStatusSummary() {
            lock (syncLock) {
                var s = new Dictionary<string, object>();
                s["status"] = "ok";
                s["mode"] = "zero-central-memory";
                s["edition"] = "vox-populi-dev-alpha-beta-mode3";
                s["revision"] = state["revision"];
                s["updatedAt"] = state["updatedAt"];
                s["memoryDir"] = memoryDir;
                s["persistedOnDisk"] = File.Exists(stateFile);
                s["backupOnDisk"] = File.Exists(bakFile);
                s["tunnelUrl"] = TunnelManager.CurrentTunnelUrl;
                s["inviteUrl"] = TunnelManager.CurrentInviteUrl;
                s["counts"] = GetCounts();
                return s;
            }
        }

        private static List<object> FilterSince(Dictionary<string, object> map, long since) {
            if (since <= 0) return new List<object>(map.Values);
            var list = new List<object>();
            foreach (object val in map.Values) {
                var d = AsDict(val);
                if (d == null || ItemTimestamp(d) >= since) list.Add(val);
            }
            return list;
        }

        public Dictionary<string, object> ExportState(bool includeBlobs, long since = 0L, HashSet<string> knownBlobs = null) {
            lock (syncLock) {
                var s = GetStatusSummary();
                s["posts"] = FilterSince((Dictionary<string, object>)state["posts"], since);
                s["tombstones"] = FilterSince((Dictionary<string, object>)state["tombstones"], since);
                s["profiles"] = new List<object>(((Dictionary<string, object>)state["profiles"]).Values);
                s["manifests"] = FilterSince((Dictionary<string, object>)state["manifests"], since);
                var blobList = new List<object>();
                var blobsMap = (Dictionary<string, object>)state["blobs"];
                foreach (string h in blobsMap.Keys) {
                    if (knownBlobs != null && knownBlobs.Contains(h)) continue;
                    if (includeBlobs) {
                        var b = GetBlob(h);
                        if (b != null) blobList.Add(b);
                    } else {
                        blobList.Add(blobsMap[h]);
                    }
                }
                s["blobs"] = blobList;
                return s;
            }
        }

        public string ReadCommunityMirror(string commId) {
            if (!SafeId.IsMatch(commId ?? "")) return null;
            string p = Path.Combine(cacheDir, "index_" + commId + ".json");
            return File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : null;
        }

        public bool WriteCommunityMirror(string rawJson, out string commId) {
            commId = "";
            try {
                var d = CreateSerializer().Deserialize<Dictionary<string, object>>(rawJson);
                commId = GetStr(d, "communityId");
                if (!SafeId.IsMatch(commId)) return false;
                AtomicWriteBytes(Path.Combine(cacheDir, "index_" + commId + ".json"), Encoding.UTF8.GetBytes(rawJson));
                return true;
            } catch {
                return false;
            }
        }

        public string ReadCachedTx(string txId) {
            if (!TxIdRegex.IsMatch(txId ?? "")) return null;
            string p = Path.Combine(cacheDir, txId);
            return File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : null;
        }
    }

    public sealed class LoopbackNodeServer {
        private readonly MemoryStore store;
        private readonly string controlToken;
        private readonly string nodeId;
        private TcpListener relay3921;
        private TcpListener relay3920;
        private TcpListener control3922;
        private volatile bool running;
        private volatile bool paused;

        public LoopbackNodeServer(MemoryStore memoryStore) {
            store = memoryStore;
            controlToken = EnsureControlToken(Path.Combine(store.DataDir, "control.token"));
            nodeId = EnsureNodeId(Path.Combine(store.DataDir, "identity.json"));
        }

        public bool IsRunning { get { return running; } }
        public bool IsPaused { get { return paused; } set { paused = value; } }

        private static string EnsureControlToken(string path) {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path)) {
                string t = File.ReadAllText(path, Encoding.UTF8).Trim();
                if (!string.IsNullOrEmpty(t)) return t;
            }
            byte[] buf = new byte[24];
            using (var rng = RandomNumberGenerator.Create()) { rng.GetBytes(buf); }
            string token = Convert.ToBase64String(buf).Replace("+", "-").Replace("/", "_").TrimEnd('=');
            File.WriteAllText(path, token, Encoding.UTF8);
            return token;
        }

        private static string EnsureNodeId(string path) {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            if (File.Exists(path)) {
                try {
                    var d = MemoryStore.CreateSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path, Encoding.UTF8));
                    if (d != null && d.ContainsKey("nodeId")) return d["nodeId"].ToString();
                } catch { }
            }
            string id = Guid.NewGuid().ToString();
            File.WriteAllText(path, "{\"nodeId\":\"" + id + "\"}", Encoding.UTF8);
            return id;
        }

        public bool TryStart() {
            if (running) return true;
            try {
                relay3921 = new TcpListener(IPAddress.Loopback, 3921);
                relay3921.ExclusiveAddressUse = false;
                relay3921.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                relay3921.Start();
            } catch {
                relay3921 = null;
                return false;
            }
            running = true;
            StartAcceptLoop(relay3921, false);
            TryStartOptional(ref relay3920, 3920, false);
            TryStartOptional(ref control3922, 3922, true);
            WriteStatusFile();
            var counts = store.GetCounts();
            store.WriteLog("BOOT", string.Format("Ativo em 127.0.0.1:3921 / :3920 (ctrl :3922) | posts={0}, profiles={1}, blobs={2}",
                counts["posts"], counts["profiles"], counts["blobs"]));
            return true;
        }

        private void TryStartOptional(ref TcpListener listener, int port, bool isControl) {
            try {
                listener = new TcpListener(IPAddress.Loopback, port);
                listener.ExclusiveAddressUse = false;
                listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                listener.Start();
                StartAcceptLoop(listener, isControl);
            } catch {
                listener = null;
            }
        }

        private void StartAcceptLoop(TcpListener listener, bool isControl) {
            ThreadPool.QueueUserWorkItem(_ => {
                while (running && listener != null) {
                    try {
                        var client = listener.AcceptTcpClient();
                        ThreadPool.QueueUserWorkItem(__ => HandleClient(client, isControl));
                    } catch {
                        break;
                    }
                }
            });
        }

        public void Stop() {
            running = false;
            TunnelManager.StopTunnel();
            StopListener(ref relay3920);
            StopListener(ref relay3921);
            StopListener(ref control3922);
            store.SaveState();
            WriteStatusFile();
            store.WriteLog("STOP", "Servidor encerrado e state.json consolidado.");
        }

        private static void StopListener(ref TcpListener l) {
            if (l == null) return;
            try { l.Stop(); } catch { }
            l = null;
        }

        public void WriteStatusFile() {
            try {
                string statusPath = Path.Combine(store.DataDir, "status.json");
                byte[] bytes = Encoding.UTF8.GetBytes(MemoryStore.CreateSerializer().Serialize(BuildControlStatus()));
                MemoryStore.AtomicWriteBytes(statusPath, bytes);
            } catch { }
        }

        private void HandleClient(TcpClient client, bool isControl) {
            using (client) {
                try {
                    client.ReceiveTimeout = 4000;
                    client.SendTimeout = 4000;
                    var stream = client.GetStream();
                    string method, path, tokenHeader;
                    string body = ReadHttpRequest(stream, out method, out path, out tokenHeader);
                    if (string.IsNullOrEmpty(method)) return;
                    if (method == "OPTIONS") {
                        WriteHttpResponse(stream, 204, "No Content", "");
                        return;
                    }
                    if (isControl) HandleControlRequest(stream, method, path, tokenHeader);
                    else HandleRelayRequest(stream, method, path, body);
                } catch { }
            }
        }

        private static string ReadHttpRequest(NetworkStream stream, out string method, out string path, out string tokenHeader) {
            method = ""; path = ""; tokenHeader = "";
            var headerBytes = new List<byte>();
            int b;
            while ((b = stream.ReadByte()) != -1) {
                headerBytes.Add((byte)b);
                int count = headerBytes.Count;
                if (count >= 4 && headerBytes[count - 4] == 13 && headerBytes[count - 3] == 10 && headerBytes[count - 2] == 13 && headerBytes[count - 1] == 10) break;
                if (count > 16384) return "";
            }
            if (headerBytes.Count == 0) return "";
            string[] lines = Encoding.ASCII.GetString(headerBytes.ToArray()).Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length < 2) return "";
            method = first[0].Trim().ToUpperInvariant();
            path = first[1].Split('?')[0].TrimEnd('/');
            if (string.IsNullOrEmpty(path)) path = "/health";

            int contentLength = 0;
            for (int i = 1; i < lines.Length; i++) {
                string line = lines[i];
                if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase)) int.TryParse(line.Substring(15).Trim(), out contentLength);
                else if (line.StartsWith("X-Vox-Node-Token:", StringComparison.OrdinalIgnoreCase)) tokenHeader = line.Substring(17).Trim();
            }
            if (contentLength <= 0 || contentLength > 4 * 1024 * 1024) return "";
            byte[] bodyBuf = new byte[contentLength];
            int read = 0;
            while (read < contentLength) {
                int r = stream.Read(bodyBuf, read, contentLength - read);
                if (r <= 0) break;
                read += r;
            }
            return Encoding.UTF8.GetString(bodyBuf, 0, read);
        }

        private void HandleControlRequest(NetworkStream stream, string method, string path, string token) {
            var ser = MemoryStore.CreateSerializer();
            if (method == "GET" && path == "/api/status") {
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(BuildControlStatus()));
                return;
            }
            if (method == "POST") {
                if (token != controlToken) {
                    WriteHttpResponse(stream, 401, "Unauthorized", "{\"error\":\"unauthorized\"}");
                    return;
                }
                if (path == "/api/pause") { paused = true; WriteStatusFile(); WriteHttpResponse(stream, 200, "OK", "{\"status\":\"accepted\",\"action\":\"/api/pause\"}"); return; }
                if (path == "/api/resume") { paused = false; WriteStatusFile(); WriteHttpResponse(stream, 200, "OK", "{\"status\":\"accepted\",\"action\":\"/api/resume\"}"); return; }
                if (path == "/api/stop") {
                    WriteHttpResponse(stream, 200, "OK", "{\"status\":\"accepted\",\"action\":\"/api/stop\"}");
                    ThreadPool.QueueUserWorkItem(_ => { Thread.Sleep(100); Stop(); Application.Exit(); });
                    return;
                }
            }
            WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"not_found\"}");
        }

        public Dictionary<string, object> BuildControlStatus() {
            var d = new Dictionary<string, object>();
            d["app"] = "Vox Populi Node Zero";
            d["edition"] = "dev-alpha-beta";
            d["mode"] = "zero-central-memory";
            d["nodeId"] = nodeId;
            d["updatedAt"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
            d["machine"] = Environment.MachineName;
            d["platform"] = "windows";
            d["state"] = !running ? "STOPPED" : (paused ? "PAUSED" : "ACTIVE");
            var relay = new Dictionary<string, object>();
            relay["active"] = running && !paused;
            relay["url"] = "http://127.0.0.1:3921";
            relay["compatUrl"] = "http://127.0.0.1:3920";
            relay["cacheDir"] = store.CacheDir;
            d["relay"] = relay;
            d["centralMemory"] = store.GetStatusSummary();
            return d;
        }

        private void HandleRelayRequest(NetworkStream stream, string method, string path, string body) {
            var ser = MemoryStore.CreateSerializer();
            if (method == "GET") {
                HandleRelayGet(stream, path, ser);
                return;
            }
            if (method == "POST") {
                if (paused) {
                    WriteHttpResponse(stream, 503, "Service Unavailable", "{\"error\":\"node_paused\"}");
                    return;
                }
                HandleRelayPost(stream, path, body, ser);
                return;
            }
            WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"not_found\"}");
        }

        private void HandleRelayGet(NetworkStream stream, string path, JavaScriptSerializer ser) {
            if (path == "" || path == "/" || path == "/dashboard" || path == "/monitor") {
                string dashHtml = store.GetDashboardHtml();
                WriteHttpResponse(stream, 200, "OK", dashHtml, "text/html; charset=utf-8");
                return;
            }
            if (path == "/memory/logs" || path == "/api/logs") {
                var logs = store.GetRecentLogs(150);
                var resp = new Dictionary<string, object>();
                resp["status"] = "ok";
                resp["count"] = logs.Count;
                resp["logs"] = logs;
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(resp));
                return;
            }
            if (path == "/health") {
                var h = new Dictionary<string, object>();
                h["status"] = "ok";
                h["app"] = "vox-relay";
                h["version"] = "0.5.0-dev-alpha-beta";
                h["mode"] = "zero-central-memory";
                h["centralMemory"] = store.GetStatusSummary();
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(h));
                return;
            }
            if (path == "/memory" || path == "/memory/status") {
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(store.GetStatusSummary()));
                return;
            }
            if (path == "/memory/state") {
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(store.ExportState(true)));
                return;
            }
            if (path.StartsWith("/memory/blob/")) {
                var blob = store.GetBlob(path.Substring("/memory/blob/".Length));
                if (blob != null) WriteHttpResponse(stream, 200, "OK", ser.Serialize(blob));
                else WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"blob_not_found\"}");
                return;
            }
            if (path == "/memory/checkpoint") {
                string chkPath = store.SaveDatedCheckpoint();
                var resp = new Dictionary<string, object>();
                resp["status"] = "ok";
                resp["checkpointFile"] = Path.GetFileName(chkPath);
                resp["fullPath"] = chkPath;
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(resp));
                return;
            }
            if (path.StartsWith("/memory/vault/")) {
                string key = path.Substring("/memory/vault/".Length).Trim();
                var vrec = store.GetVaultRecord(key);
                if (vrec != null) {
                    var resp = new Dictionary<string, object>();
                    resp["status"] = "ok";
                    resp["vaultKey"] = key;
                    resp["record"] = vrec;
                    WriteHttpResponse(stream, 200, "OK", ser.Serialize(resp));
                } else {
                    WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"vault_not_found\"}");
                }
                return;
            }
            if (path.StartsWith("/vox/index/") && path.EndsWith(".json")) {
                string comm = path.Substring("/vox/index/".Length, path.Length - "/vox/index/".Length - 5);
                string mirror = store.ReadCommunityMirror(comm);
                if (mirror != null) WriteHttpResponse(stream, 200, "OK", mirror);
                else WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"mirror_not_found\"}");
                return;
            }
            if (path.StartsWith("/tx/")) {
                string cached = store.ReadCachedTx(path.Substring(4));
                if (cached != null) WriteHttpResponse(stream, 200, "OK", cached);
                else WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"tx_not_found\"}");
                return;
            }
            WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"not_found\"}");
        }

        private void HandleRelayPost(NetworkStream stream, string path, string body, JavaScriptSerializer ser) {
            if (path == "/vox/mirror") {
                string commId;
                if (store.WriteCommunityMirror(body, out commId)) {
                    WriteHttpResponse(stream, 200, "OK", "{\"status\":\"mirrored\",\"communityId\":\"" + commId + "\"}");
                } else {
                    WriteHttpResponse(stream, 400, "Bad Request", "{\"error\":\"invalid_mirror\"}");
                }
                return;
            }
            var payload = ser.Deserialize<Dictionary<string, object>>(body);
            if (path == "/memory/ingest") {
                var res = store.IngestEvent(payload);
                bool changed = res.ContainsKey("changed") && (bool)res["changed"];
                WriteHttpResponse(stream, changed ? 201 : 200, "OK", ser.Serialize(res));
                return;
            }
            if (path == "/memory/sync") {
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(store.SyncBundle(payload)));
                return;
            }
            if (path == "/memory/checkpoint") {
                string chkPath = store.SaveDatedCheckpoint();
                var resp = new Dictionary<string, object>();
                resp["status"] = "ok";
                resp["checkpointFile"] = Path.GetFileName(chkPath);
                resp["fullPath"] = chkPath;
                WriteHttpResponse(stream, 200, "OK", ser.Serialize(resp));
                return;
            }
            if (path.StartsWith("/memory/vault/")) {
                string key = path.Substring("/memory/vault/".Length).Trim();
                var record = payload != null && payload.ContainsKey("record") ? MemoryStore.AsDict(payload["record"]) : payload;
                bool ok = store.SaveVaultRecord(key, record);
                WriteHttpResponse(stream, ok ? 200 : 400, "OK", ok ? "{\"status\":\"saved\"}" : "{\"error\":\"save_failed\"}");
                return;
            }
            WriteHttpResponse(stream, 404, "Not Found", "{\"error\":\"not_found\"}");
        }

        private static void WriteHttpResponse(NetworkStream stream, int code, string reason, string body, string contentType = "application/json; charset=utf-8") {
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body ?? "");
            var sb = new StringBuilder();
            sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", code, reason);
            sb.AppendFormat("Content-Type: {0}\r\n", contentType);
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With\r\n");
            sb.Append("Access-Control-Allow-Private-Network: true\r\n");
            sb.Append("Connection: close\r\n");
            sb.AppendFormat("Content-Length: {0}\r\n\r\n", bodyBytes.Length);
            byte[] hdrBytes = Encoding.ASCII.GetBytes(sb.ToString());
            stream.Write(hdrBytes, 0, hdrBytes.Length);
            if (bodyBytes.Length > 0) stream.Write(bodyBytes, 0, bodyBytes.Length);
            stream.Flush();
        }
    }

    public static class TunnelManager {
        private static readonly Regex TryCloudflareRegex = new Regex(@"https://[a-zA-Z0-9-]+\.trycloudflare\.com", RegexOptions.Compiled);
        private const string BeaconHost = "vox-sentinel.onrender.com";
        private static Process tunnelProc;
        private static volatile string tunnelUrl = "";
        private static volatile bool beaconActive;
        private static Thread beaconThread;

        public static string CurrentTunnelUrl { get { return tunnelUrl; } }
        public static string CurrentInviteUrl {
            get {
                return string.IsNullOrEmpty(tunnelUrl)
                    ? ""
                    : "https://vox-9df.pages.dev/?memory=" + Uri.EscapeDataString(tunnelUrl);
            }
        }

        private static string FindCloudflaredPath() {
            string[] candidates = new string[] {
                @"C:\Program Files (x86)\cloudflared\cloudflared.exe",
                @"C:\Program Files\cloudflared\cloudflared.exe",
                "cloudflared.exe"
            };
            foreach (string c in candidates) {
                if (c == "cloudflared.exe" || File.Exists(c)) return c;
            }
            return "";
        }

        private static void SendMaskedWsText(Stream stream, string text) {
            byte[] payload = Encoding.UTF8.GetBytes(text);
            byte[] mask = new byte[] { 0x37, 0xFA, 0x21, 0x3D };
            var frame = new List<byte>();
            frame.Add(0x81);
            if (payload.Length < 126) {
                frame.Add((byte)(0x80 | payload.Length));
            } else {
                frame.Add((byte)(0x80 | 126));
                frame.Add((byte)((payload.Length >> 8) & 0xFF));
                frame.Add((byte)(payload.Length & 0xFF));
            }
            frame.AddRange(mask);
            for (int i = 0; i < payload.Length; i++) {
                frame.Add((byte)(payload[i] ^ mask[i % 4]));
            }
            byte[] raw = frame.ToArray();
            stream.Write(raw, 0, raw.Length);
            stream.Flush();
        }

        private static void RunSingleBeaconSession() {
            using (var tcp = new TcpClient()) {
                tcp.ReceiveTimeout = 30000;
                tcp.SendTimeout = 10000;
                tcp.Connect(BeaconHost, 443);
                using (var ssl = new SslStream(tcp.GetStream(), false)) {
                    ssl.AuthenticateAsClient(BeaconHost, null, SslProtocols.Tls12, false);
                    string req = "GET / HTTP/1.1\r\n" +
                                 "Host: " + BeaconHost + "\r\n" +
                                 "Upgrade: websocket\r\n" +
                                 "Connection: Upgrade\r\n" +
                                 "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
                                 "Sec-WebSocket-Version: 13\r\n\r\n";
                    byte[] reqBytes = Encoding.ASCII.GetBytes(req);
                    ssl.Write(reqBytes, 0, reqBytes.Length);
                    ssl.Flush();

                    var hdr = new StringBuilder();
                    int b;
                    while ((b = ssl.ReadByte()) != -1) {
                        hdr.Append((char)b);
                        if (hdr.Length >= 4 && hdr.ToString(hdr.Length - 4, 4) == "\r\n\r\n") break;
                        if (hdr.Length > 8192) return;
                    }
                    if (!hdr.ToString().Contains("101")) return;

                    byte[] drainBuf = new byte[2048];
                    while (beaconActive && !string.IsNullOrEmpty(tunnelUrl)) {
                        string msg = "{\"type\":\"register\",\"peerId\":\"peer_zero_memory_beacon\",\"address\":\"vx_zero_memory_beacon\",\"dmPub\":{\"memoryUrl\":\"" + tunnelUrl + "\",\"service\":\"zero-central-memory\"}}";
                        SendMaskedWsText(ssl, msg);
                        for (int i = 0; i < 40 && beaconActive; i++) {
                            if (tcp.Available > 0) {
                                int r = ssl.Read(drainBuf, 0, drainBuf.Length);
                                if (r <= 0) return;
                            }
                            Thread.Sleep(500);
                        }
                    }
                }
            }
        }

        private static void EnsureBeaconThread() {
            beaconActive = true;
            if (beaconThread != null && beaconThread.IsAlive) return;
            beaconThread = new Thread(() => {
                while (beaconActive) {
                    if (!string.IsNullOrEmpty(tunnelUrl)) {
                        try { RunSingleBeaconSession(); } catch { }
                    }
                    for (int i = 0; i < 10 && beaconActive; i++) Thread.Sleep(500);
                }
            });
            beaconThread.IsBackground = true;
            beaconThread.Start();
        }

        public static void StartTunnel(string dataDir) {
            if (tunnelProc != null && !tunnelProc.HasExited) return;
            string exe = FindCloudflaredPath();
            if (string.IsNullOrEmpty(exe)) return;
            try {
                var psi = new ProcessStartInfo {
                    FileName = exe,
                    Arguments = "tunnel --url http://127.0.0.1:3921 --no-autoupdate",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true
                };
                tunnelProc = new Process { StartInfo = psi, EnableRaisingEvents = true };
                DataReceivedEventHandler onLine = (s, e) => {
                    if (string.IsNullOrEmpty(e.Data)) return;
                    var m = TryCloudflareRegex.Match(e.Data);
                    if (m.Success && string.IsNullOrEmpty(tunnelUrl)) {
                        tunnelUrl = m.Value;
                        try {
                            File.WriteAllText(Path.Combine(dataDir, "tunnel_url.txt"), tunnelUrl + "\r\n" + CurrentInviteUrl, Encoding.UTF8);
                        } catch { }
                        EnsureBeaconThread();
                    }
                };
                tunnelProc.OutputDataReceived += onLine;
                tunnelProc.ErrorDataReceived += onLine;
                tunnelProc.Start();
                tunnelProc.BeginOutputReadLine();
                tunnelProc.BeginErrorReadLine();
            } catch {
                tunnelProc = null;
            }
        }

        public static void StopTunnel() {
            beaconActive = false;
            try {
                if (tunnelProc != null && !tunnelProc.HasExited) {
                    tunnelProc.Kill();
                    tunnelProc.Dispose();
                }
            } catch { }
            tunnelProc = null;
            tunnelUrl = "";
        }
    }

    public static class NodeProbe {
        private const string RunRegistryKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunValueName = "VoxPopuliZeroCentralMemory";

        public static string FetchGet(string url) {
            try {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "GET";
                req.Timeout = 1000;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8)) {
                    return sr.ReadToEnd();
                }
            } catch {
                return null;
            }
        }

        public static bool SendControlCommand(string dataDir, string command) {
            try {
                string tokenPath = Path.Combine(dataDir, "control.token");
                string token = File.Exists(tokenPath) ? File.ReadAllText(tokenPath, Encoding.UTF8).Trim() : "";
                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3922/api/" + command);
                req.Method = "POST";
                req.Timeout = 1500;
                req.ContentType = "application/json";
                if (!string.IsNullOrEmpty(token)) req.Headers["X-Vox-Node-Token"] = token;
                byte[] body = Encoding.UTF8.GetBytes("{}");
                req.ContentLength = body.Length;
                using (var s = req.GetRequestStream()) { s.Write(body, 0, body.Length); }
                using (var resp = (HttpWebResponse)req.GetResponse()) {
                    return (int)resp.StatusCode == 200;
                }
            } catch {
                return false;
            }
        }

        public static bool IsAutostartEnabled() {
            try {
                using (var key = Registry.CurrentUser.OpenSubKey(RunRegistryKey, false)) {
                    return key != null && key.GetValue(RunValueName) != null;
                }
            } catch {
                return false;
            }
        }

        public static void SetAutostart(bool enabled) {
            try {
                using (var key = Registry.CurrentUser.CreateSubKey(RunRegistryKey)) {
                    if (key == null) return;
                    if (enabled) {
                        string exe = Process.GetCurrentProcess().MainModule.FileName;
                        key.SetValue(RunValueName, "\"" + exe + "\"");
                    } else {
                        key.DeleteValue(RunValueName, false);
                    }
                }
            } catch { }
        }
    }

    public sealed class DevStatusForm : Form {
        private readonly MemoryStore store;
        private readonly LoopbackNodeServer server;
        private readonly Action onCheckpoint;
        private Label statusBadge;
        private Label metricsBox;

        public DevStatusForm(MemoryStore memoryStore, LoopbackNodeServer nodeServer, Action checkpointCallback) {
            store = memoryStore;
            server = nodeServer;
            onCheckpoint = checkpointCallback;
            BuildForm();
            RefreshView();
        }

        private void BuildForm() {
            Text = "Vox Populi • Zero-Central-Memory (Dev Alpha/Beta)";
            Size = new Size(460, 325);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = ColorTranslator.FromHtml("#0B1017");
            ForeColor = ColorTranslator.FromHtml("#E6EDF3");
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            try {
                var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("vox.ico");
                if (s != null) Icon = new Icon(s);
            } catch { }

            var header = new Label {
                Text = "VOX POPULI • ZERO-CENTRAL-MEMORY",
                Font = new Font("Segoe UI", 11.5f, FontStyle.Bold),
                ForeColor = ColorTranslator.FromHtml("#58A6FF"),
                Location = new Point(18, 14),
                AutoSize = true
            };
            statusBadge = new Label {
                Text = "● ATIVO [Dev Alpha/Beta] • 127.0.0.1:3921 / 3920",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = ColorTranslator.FromHtml("#3FB950"),
                Location = new Point(18, 38),
                AutoSize = true
            };
            metricsBox = new Label {
                Font = new Font("Consolas", 9.5f, FontStyle.Regular),
                ForeColor = ColorTranslator.FromHtml("#C9D1D9"),
                BackColor = ColorTranslator.FromHtml("#161B22"),
                BorderStyle = BorderStyle.FixedSingle,
                Padding = new Padding(10),
                Location = new Point(18, 66),
                Size = new Size(408, 134)
            };
            var pathLabel = new Label {
                Text = store.MemoryDir,
                Font = new Font("Segoe UI", 8f, FontStyle.Regular),
                ForeColor = ColorTranslator.FromHtml("#8B949E"),
                Location = new Point(18, 206),
                Size = new Size(408, 18),
                AutoEllipsis = true
            };

            var dashBtn = CreateBtn("Dashboard", new Point(18, 232), 98, "#238636", (s, e) => {
                try { Process.Start("http://127.0.0.1:3921/dashboard"); } catch { }
            });
            var snapBtn = CreateBtn("Checkpoint", new Point(122, 232), 98, "#1F6FEB", (s, e) => {
                if (onCheckpoint != null) onCheckpoint();
                RefreshView();
            });
            var dirBtn = CreateBtn("Abrir Pasta", new Point(226, 232), 98, "#21262D", (s, e) => {
                Directory.CreateDirectory(store.MemoryDir);
                Process.Start("explorer.exe", store.MemoryDir);
            });
            var hideBtn = CreateBtn("Ocultar", new Point(330, 232), 96, "#21262D", (s, e) => Hide());

            Controls.AddRange(new Control[] { header, statusBadge, metricsBox, pathLabel, dashBtn, snapBtn, dirBtn, hideBtn });
        }

        private static Button CreateBtn(string text, Point pt, int width, string bgHex, EventHandler onClick) {
            var b = new Button {
                Text = text,
                Location = pt,
                Size = new Size(width, 34),
                FlatStyle = FlatStyle.Flat,
                BackColor = ColorTranslator.FromHtml(bgHex),
                ForeColor = Color.White,
                Cursor = Cursors.Hand
            };
            b.FlatAppearance.BorderColor = ColorTranslator.FromHtml("#30363D");
            b.Click += onClick;
            return b;
        }

        public void RefreshView() {
            var summary = store.LoadState(true);
            var counts = store.GetCounts();
            long rev = summary.ContainsKey("revision") ? Convert.ToInt64(summary["revision"]) : 0L;
            bool onDisk = File.Exists(Path.Combine(store.MemoryDir, "state.json"));
            bool hasBak = File.Exists(Path.Combine(store.MemoryDir, "state.json.bak"));

            bool paused = server.IsPaused;
            statusBadge.Text = paused
                ? "⏸ PAUSADO [Dev Alpha/Beta] • 127.0.0.1:3921 / 3920"
                : "● ATIVO [Dev Alpha/Beta] • 127.0.0.1:3921 / 3920";
            statusBadge.ForeColor = paused ? ColorTranslator.FromHtml("#D29922") : ColorTranslator.FromHtml("#3FB950");

            var sb = new StringBuilder();
            sb.AppendFormat("Posts / Tópicos / Respostas : {0}\r\n", counts["posts"]);
            sb.AppendFormat("Perfis (Profile Cards)      : {0}\r\n", counts["profiles"]);
            sb.AppendFormat("Tombstones (Retratações)    : {0}\r\n", counts["tombstones"]);
            sb.AppendFormat("Blobs de Mídia / Manifestos : {0} / {1}\r\n", counts["blobs"], counts["manifests"]);
            sb.AppendFormat("Revisão #{0}  |  state.json: {1}  |  .bak: {2}\r\n", rev, onDisk ? "OK" : "-", hasBak ? "OK" : "-");
            string tUrl = TunnelManager.CurrentTunnelUrl;
            sb.AppendFormat("Modo 3 HTTPS: {0}", string.IsNullOrEmpty(tUrl) ? "Iniciando túnel..." : tUrl);
            metricsBox.Text = sb.ToString();
        }

        protected override void OnFormClosing(FormClosingEventArgs e) {
            if (e.CloseReason == CloseReason.UserClosing) {
                e.Cancel = true;
                Hide();
                return;
            }
            base.OnFormClosing(e);
        }
    }

    public sealed class VoxPopuliTrayContext : ApplicationContext {
        private readonly MemoryStore store;
        private readonly LoopbackNodeServer server;
        private NotifyIcon trayIcon;
        private ToolStripMenuItem stateMenuItem;
        private ToolStripMenuItem countersMenuItem;
        private ToolStripMenuItem tunnelMenuItem;
        private ToolStripMenuItem pauseResumeMenuItem;
        private ToolStripMenuItem autostartMenuItem;
        private System.Windows.Forms.Timer pollTimer;
        private DevStatusForm statusForm;
        private int tickCount;
        private bool announcedTunnel;

        public VoxPopuliTrayContext(MemoryStore memoryStore, LoopbackNodeServer nodeServer, bool openPanelOnBoot) {
            store = memoryStore;
            server = nodeServer;
            TunnelManager.StartTunnel(store.DataDir);
            InitializeTray();
            RefreshTrayState();

            SystemEvents.SessionEnding += OnSessionEnding;
            Application.ApplicationExit += OnAppExit;

            pollTimer = new System.Windows.Forms.Timer();
            pollTimer.Interval = 3000;
            pollTimer.Tick += OnTimerTick;
            pollTimer.Start();

            try {
                var counts = store.GetCounts();
                trayIcon.ShowBalloonTip(
                    3000,
                    "Vox Populi • Zero-Central-Memory (Alpha/Beta)",
                    string.Format("Sustentando a rede na bandeja (127.0.0.1:3921 / 3920). Memória carregada: {0} posts, {1} perfis.", counts["posts"], counts["profiles"]),
                    ToolTipIcon.Info);
            } catch { }

            if (openPanelOnBoot) ShowStatusPanel();
        }

        private Icon LoadAppIcon() {
            try {
                var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("vox.ico");
                if (s != null) return new Icon(s);
            } catch { }
            return SystemIcons.Shield;
        }

        private void InitializeTray() {
            var menu = new ContextMenuStrip();

            var headerItem = new ToolStripMenuItem("Vox Populi • Zero-Central-Memory [Alpha/Beta]") { Enabled = false };
            headerItem.Font = new Font(headerItem.Font, FontStyle.Bold);
            menu.Items.Add(headerItem);

            stateMenuItem = new ToolStripMenuItem("● Ativo em 127.0.0.1:3921 e :3920") { Enabled = false };
            menu.Items.Add(stateMenuItem);

            countersMenuItem = new ToolStripMenuItem("Memória: carregando...") { Enabled = false };
            menu.Items.Add(countersMenuItem);

            tunnelMenuItem = new ToolStripMenuItem("🌐 Modo 3 HTTPS: conectando túnel...") { Enabled = false };
            menu.Items.Add(tunnelMenuItem);

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Abrir Dashboard Interativo (Navegador)", null, (s, e) => {
                try { Process.Start("http://127.0.0.1:3921/dashboard"); } catch { }
            });
            menu.Items.Add("Copiar Link de Convite Alpha/Beta (Modo 3)", null, (s, e) => CopyInviteUrlToClipboard());
            menu.Items.Add("Copiar URL do Túnel HTTPS (Buddy Relay)", null, (s, e) => CopyTunnelUrlToClipboard());
            menu.Items.Add("Abrir Painel de Status", null, (s, e) => ShowStatusPanel());
            menu.Items.Add("Salvar Snapshot Agora (state.json + .bak)", null, (s, e) => SaveSnapshotNow());
            menu.Items.Add("Criar Checkpoint Datado (Alpha/Beta)", null, (s, e) => CreateCheckpointNow());

            pauseResumeMenuItem = new ToolStripMenuItem("Pausar Ingestão", null, (s, e) => TogglePause());
            menu.Items.Add(pauseResumeMenuItem);

            menu.Items.Add("Abrir Pasta da Memória Central", null, (s, e) => {
                Directory.CreateDirectory(store.MemoryDir);
                Process.Start("explorer.exe", store.MemoryDir);
            });
            menu.Items.Add("Abrir Log de Execução (node-zero.log)", null, (s, e) => {
                if (File.Exists(store.LogFile)) Process.Start("notepad.exe", store.LogFile);
            });

            autostartMenuItem = new ToolStripMenuItem("Iniciar com o Windows (Máquina Dev)", null, (s, e) => {
                bool next = !NodeProbe.IsAutostartEnabled();
                NodeProbe.SetAutostart(next);
                RefreshTrayState();
            });
            menu.Items.Add(autostartMenuItem);

            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Sair e Parar Nó Vox Populi", null, (s, e) => ExitNode());

            trayIcon = new NotifyIcon {
                Icon = LoadAppIcon(),
                Text = "Vox Populi [Alpha/Beta] • Zero-Central-Memory",
                ContextMenuStrip = menu,
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => ShowStatusPanel();
        }

        private void OnTimerTick(object sender, EventArgs e) {
            tickCount++;
            if (!server.IsRunning && string.IsNullOrEmpty(NodeProbe.FetchGet("http://127.0.0.1:3921/memory/status"))) {
                server.TryStart();
            }
            if (tickCount % 10 == 0) {
                store.SaveState();
                server.WriteStatusFile();
            }
            RefreshTrayState();
        }

        private void RefreshTrayState() {
            var state = store.LoadState(true);
            var counts = store.GetCounts();
            long rev = state.ContainsKey("revision") ? Convert.ToInt64(state["revision"]) : 0L;

            bool paused = server.IsPaused;
            stateMenuItem.Text = paused
                ? "⏸ Pausado (127.0.0.1:3921 / :3920)"
                : "● Ativo em 127.0.0.1:3921 e :3920";
            countersMenuItem.Text = string.Format("Memória: {0} posts · {1} perfis · {2} blobs (Rev #{3})",
                counts["posts"], counts["profiles"], counts["blobs"], rev);
            string tUrl = TunnelManager.CurrentTunnelUrl;
            tunnelMenuItem.Text = string.IsNullOrEmpty(tUrl)
                ? "🌐 Modo 3 HTTPS: iniciando túnel Cloudflare..."
                : "🌐 Modo 3 HTTPS: " + tUrl;
            if (!string.IsNullOrEmpty(tUrl) && !announcedTunnel) {
                announcedTunnel = true;
                store.WriteLog("TUNNEL", "Modo 3 HTTPS ativo: " + tUrl + " | Invite: " + TunnelManager.CurrentInviteUrl);
                server.WriteStatusFile();
                trayIcon.ShowBalloonTip(3500, "Modo 3 HTTPS Ativo!", "Túnel pronto: " + tUrl + "\nClique com o botão direito no ícone para copiar o link de convite.", ToolTipIcon.Info);
            }
            pauseResumeMenuItem.Text = paused ? "Retomar Sustentação da Rede" : "Pausar Ingestão";
            autostartMenuItem.Checked = NodeProbe.IsAutostartEnabled();

            string tip = string.Format("Vox Populi [Alpha/Beta] • {0} posts | Rev #{1}", counts["posts"], rev);
            if (tip.Length > 63) tip = tip.Substring(0, 63);
            trayIcon.Text = tip;

            if (statusForm != null && statusForm.Visible) {
                statusForm.RefreshView();
            }
        }

        private void ShowStatusPanel() {
            if (statusForm == null || statusForm.IsDisposed) {
                statusForm = new DevStatusForm(store, server, CreateCheckpointNow);
            }
            statusForm.RefreshView();
            statusForm.Show();
            statusForm.Activate();
        }

        private void SaveSnapshotNow() {
            store.SaveState();
            server.WriteStatusFile();
            RefreshTrayState();
            trayIcon.ShowBalloonTip(2000, "Vox Populi • Snapshot Salvo", "Estado gravado com sucesso em state.json e state.json.bak.", ToolTipIcon.Info);
        }

        private void CreateCheckpointNow() {
            string path = store.SaveDatedCheckpoint();
            RefreshTrayState();
            trayIcon.ShowBalloonTip(2500, "Checkpoint Alpha/Beta Criado", Path.GetFileName(path) + " salvo em central_memory\\checkpoints.", ToolTipIcon.Info);
        }

        private void CopyInviteUrlToClipboard() {
            string inv = TunnelManager.CurrentInviteUrl;
            if (string.IsNullOrEmpty(inv)) {
                trayIcon.ShowBalloonTip(2000, "Túnel Modo 3", "O túnel HTTPS ainda está inicializando. Aguarde alguns segundos.", ToolTipIcon.Warning);
                return;
            }
            Clipboard.SetText(inv);
            trayIcon.ShowBalloonTip(2500, "Link Alpha/Beta Copiado!", inv, ToolTipIcon.Info);
        }

        private void CopyTunnelUrlToClipboard() {
            string url = TunnelManager.CurrentTunnelUrl;
            if (string.IsNullOrEmpty(url)) return;
            Clipboard.SetText(url);
            trayIcon.ShowBalloonTip(2000, "URL do Túnel Copiada!", url, ToolTipIcon.Info);
        }

        private void TogglePause() {
            server.IsPaused = !server.IsPaused;
            server.WriteStatusFile();
            RefreshTrayState();
        }

        private void OnSessionEnding(object sender, SessionEndingEventArgs e) {
            store.SaveState();
        }

        private void OnAppExit(object sender, EventArgs e) {
            if (trayIcon != null) {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
        }

        private void ExitNode() {
            if (pollTimer != null) pollTimer.Stop();
            if (server.IsRunning) server.Stop();
            else NodeProbe.SendControlCommand(store.DataDir, "stop");
            if (trayIcon != null) {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            ExitThread();
        }
    }

    public static class Program {
        private const string SingleInstanceMutexName = @"Local\VoxPopuli.NodeZero.Tray";

        public static string DefaultDataDir() {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(local, "VoxPopuli", "NodeZero");
        }

        [STAThread]
        public static int Main(string[] args) {
            string dataDir = DefaultDataDir();
            var store = new MemoryStore(dataDir);
            bool openPanel = false;

            foreach (string a in args) {
                if (a == "--check") return RunCheck(store);
                if (a == "--status" || a == "status") return PrintStatus(store);
                if (a == "--panel") openPanel = true;
                if (a == "--stop" || a == "stop") {
                    bool ok = NodeProbe.SendControlCommand(dataDir, "stop");
                    Console.WriteLine(ok ? "{\"status\":\"stopped\"}" : "{\"status\":\"not_running\"}");
                    return 0;
                }
            }

            bool createdNew;
            using (var mutex = new Mutex(true, SingleInstanceMutexName, out createdNew)) {
                var server = new LoopbackNodeServer(store);
                server.TryStart();

                foreach (string a in args) {
                    if (a == "--headless" || a == "--node-service") {
                        while (server.IsRunning) { Thread.Sleep(500); }
                        return 0;
                    }
                }

                if (!createdNew) {
                    store.WriteLog("WARN", "Instância já em execução (Mutex detectado). Ativando painel existente.");
                    return 0;
                }

                try {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new VoxPopuliTrayContext(store, server, openPanel));
                    return 0;
                } catch (Exception ex) {
                    store.WriteLog("FATAL", "Erro na inicialização da UI/Tray: " + ex.ToString());
                    while (server.IsRunning) { Thread.Sleep(1000); }
                    return 1;
                }
            }
        }

        private static int PrintStatus(MemoryStore store) {
            string live = NodeProbe.FetchGet("http://127.0.0.1:3921/memory/status");
            if (!string.IsNullOrEmpty(live)) {
                Console.WriteLine(live);
                return 0;
            }
            Console.WriteLine(MemoryStore.CreateSerializer().Serialize(store.GetStatusSummary()));
            return 0;
        }

        private static int RunCheck(MemoryStore store) {
            Console.WriteLine("--- [Autoteste Vox Populi • Zero-Central-Memory (Dev Alpha/Beta)] ---");
            Console.WriteLine("[OK] Diretório de persistência: " + store.MemoryDir);
            var counts = store.GetCounts();
            Console.WriteLine(string.Format("[OK] Estado carregado (posts={0}, profiles={1}, tombstones={2}, blobs={3})",
                counts["posts"], counts["profiles"], counts["tombstones"], counts["blobs"]));
            Console.WriteLine("--- [Autoteste concluído com sucesso!] ---");
            return 0;
        }
    }
}
