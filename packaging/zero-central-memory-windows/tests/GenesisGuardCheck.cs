// Corte da gênese no nó (GenesisGuard.cs): regra, limpeza ao carregar e recusa na entrada. Roda em test-genesis-guard.ps1.
using System; using System.Collections.Generic; using System.IO; using Vox.ZeroMemory;
class H {
  static int fails = 0;
  static void Eq(object a, object b, string m) { if (!Equals(a, b)) { fails++; Console.WriteLine("FAIL " + m + ": " + a + " != " + b); } else Console.WriteLine("ok   " + m); }
  static Dictionary<string, object> Post(string id, string author, long ts) { return new Dictionary<string, object> { {"id", id}, {"type", "topic"}, {"author", author}, {"ts", ts}, {"title", "t"} }; }
  static int Main() {
    string test = "vx_WAqxgW1JLEg7GtkA-lP-"; long g = GenesisData.GenesisMs;
    Eq(MemoryStore.IsTestRouteId("vx_voxbrasil_welcome"), false, "Vox oficial fica");
    Eq(MemoryStore.RefusesPost(Post("a", "vx_novo", g - 1)), true, "post pre-genese recusado");
    Eq(MemoryStore.RefusesPost(new Dictionary<string, object> { {"id","a"}, {"author","vx_novo"}, {"updatedAt", g - 1} }), false, "sem data de criacao fica");
    string dir = Path.Combine(Path.GetTempPath(), "nz-guard-" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(Path.Combine(dir, "central_memory"));
    File.WriteAllText(Path.Combine(dir, "central_memory", "state.json"),
      "{\"revision\":7,\"posts\":{\"velho\":{\"id\":\"velho\",\"author\":\"vx_novo\",\"ts\":" + (g - 1000) + "},\"novo\":{\"id\":\"novo\",\"author\":\"vx_novo\",\"ts\":" + (g + 1000) + "}},\"profiles\":{\"" + test + "\":{\"routeId\":\"" + test + "\"},\"vx_voxbrasil_welcome\":{\"routeId\":\"vx_voxbrasil_welcome\"}}}");
    var store = new MemoryStore(dir);
    var c = store.GetCounts();
    Eq(c["posts"], 1, "disco limpo ao carregar: posts"); Eq(c["profiles"], 1, "disco limpo ao carregar: perfis");
    var card = new Dictionary<string, object> { {"type","profile-card"}, {"id","pc_" + test}, {"routeId", test}, {"author", test}, {"editedAt", g + 5} };
    Eq((bool)store.IngestEvent(card)["changed"], false, "cartao de teste recusado na entrada");
    Eq((bool)store.IngestEvent(Post("p2", test, g + 5))["changed"], false, "post de autor de teste recusado");
    Eq((bool)store.IngestEvent(Post("p3", "vx_novo", g + 5))["changed"], true, "post novo entra");
    Console.WriteLine(fails == 0 ? "ALL OK" : fails + " FAILED");
    return fails;
  }
}
