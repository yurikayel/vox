using System;
using System.Collections.Generic;

namespace Vox.ZeroMemory {
    /// <summary>
    /// Corte da gênese no nó, com as mesmas regras do relay Python (`relay/genesis_guard.py`).
    /// Os aparelhos novos já apagam e recusam contas de teste e posts anteriores à gênese, mas um aparelho
    /// na versão antiga reenviava tudo na primeira sincronização; por isso o nó recusa na entrada e limpa ao carregar.
    /// Cartão de perfil: recusado se a chave está na lista de teste (a data do cartão não serve: cada aparelho
    /// regrava `updatedAt`). Post: recusado se o autor está na lista ou se a data de criação (`ts`, `timestamp`
    /// ou `createdAt`) é anterior à gênese; sem data de criação, fica. Lista e data: `GenesisData.cs` (gerado).
    /// </summary>
    public sealed partial class MemoryStore {
        private static readonly string[] CreatedFields = { "ts", "timestamp", "createdAt" };

        public static bool IsTestRouteId(string routeId) {
            return !string.IsNullOrEmpty(routeId) && GenesisData.TestRouteIds.Contains(routeId.Trim());
        }

        private static long CreatedMs(Dictionary<string, object> item) {
            foreach (string f in CreatedFields) {
                if (!item.ContainsKey(f)) continue;
                long v = ToLong(item[f], 0L);
                if (v > 0) return v;
            }
            return 0L;
        }

        public static bool RefusesPost(Dictionary<string, object> item) {
            if (item == null) return false;
            string author = GetStr(item, "author");
            if (string.IsNullOrEmpty(author)) author = GetStr(item, "owner");
            long created = CreatedMs(item);
            return IsTestRouteId(author) || (created > 0 && created < GenesisData.GenesisMs);
        }

        public static bool RefusesProfile(string routeId) {
            return IsTestRouteId(routeId);
        }

        /// <summary>Tira do estado carregado os posts e cartões que a regra recusa; devolve quantos saíram.</summary>
        public static int PruneGenesis(Dictionary<string, object> state) {
            int removed = 0;
            var posts = state.ContainsKey("posts") ? state["posts"] as Dictionary<string, object> : null;
            if (posts != null) {
                var drop = new List<string>();
                foreach (var kvp in posts) {
                    if (RefusesPost(AsDict(kvp.Value))) drop.Add(kvp.Key);
                }
                foreach (string k in drop) posts.Remove(k);
                removed += drop.Count;
            }
            var profiles = state.ContainsKey("profiles") ? state["profiles"] as Dictionary<string, object> : null;
            if (profiles != null) {
                var drop = new List<string>();
                foreach (string k in profiles.Keys) {
                    if (RefusesProfile(k)) drop.Add(k);
                }
                foreach (string k in drop) profiles.Remove(k);
                removed += drop.Count;
            }
            return removed;
        }
    }
}
