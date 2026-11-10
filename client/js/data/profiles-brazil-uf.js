/**
 * Perfis demo estereótipo — um por UF (27).
 * Prenomes: top 27 por frequência no Censo Demográfico 2022 (IBGE — Nomes no Brasil).
 * Fonte: https://censo2022.ibge.gov.br/nomes
 * Avatares: randomuser.me (gender=male|female); fallback de iniciais no onerror do <img>.
 */

const PORTRAIT = (gender, n) =>
  `https://randomuser.me/api/portraits/med/${gender === "m" ? "men" : "women"}/${n % 100}.jpg`;

/** Banner no perfil UF — tom acolhedor, não caricatura cruel. */
export const STEREOTYPE_GREETING =
  "Oi, sou só um estereótipo respeitoso — não me leve a mal!";
export const STEREOTYPE_DISCLAIMER_NOTE =
  "Perfil fictício para demo e educação no Vox: clichês regionais leves (comida, música, orgulho) — nunca para ridicularizar pessoas reais. 🇧🇷";

/** Embaralhamento reprodutível: um prenome único por UF. */
export const UF_NAME_SHUFFLE_SEED = 20261025;

/** 27 prenomes mais frequentes no Brasil (Censo 2022 / IBGE), ordem por ranking nacional. */
export const BRAZIL_COMMON_GIVEN_NAMES = [
  { displayName: "Maria", gender: "f" },
  { displayName: "José", gender: "m" },
  { displayName: "Ana", gender: "f" },
  { displayName: "João", gender: "m" },
  { displayName: "Antônio", gender: "m" },
  { displayName: "Francisco", gender: "m" },
  { displayName: "Pedro", gender: "m" },
  { displayName: "Carlos", gender: "m" },
  { displayName: "Lucas", gender: "m" },
  { displayName: "Luiz", gender: "m" },
  { displayName: "Paulo", gender: "m" },
  { displayName: "Gabriel", gender: "m" },
  { displayName: "Francisca", gender: "f" },
  { displayName: "Júlia", gender: "f" },
  { displayName: "Juliana", gender: "f" },
  { displayName: "Adriana", gender: "f" },
  { displayName: "Fernanda", gender: "f" },
  { displayName: "Márcia", gender: "f" },
  { displayName: "Patrícia", gender: "f" },
  { displayName: "Marcos", gender: "m" },
  { displayName: "Amanda", gender: "f" },
  { displayName: "Davi", gender: "m" },
  { displayName: "Rafael", gender: "m" },
  { displayName: "Luís", gender: "m" },
  { displayName: "Daniel", gender: "m" },
  { displayName: "Miguel", gender: "m" },
  { displayName: "Alice", gender: "f" },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seed) {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function handleFromNameAndUf(displayName, uf) {
  const slug = displayName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return `${slug}-${uf.toLowerCase()}`;
}

const UF_REGION_META = [
  { uf: "AC", stateName: "Acre", regional: { f: "acreana", m: "acreano" }, emoji: "🌳", tagline: "Calor de porteira aberta — perfil estereótipo demo.", vibe: "Tacacá na conversa, floresta perto e hospitalidade que não cabe no algoritmo.", hashtag: "acre" },
  { uf: "AL", stateName: "Alagoas", regional: { f: "alagoana", m: "alagoano" }, emoji: "🌊", tagline: "Forró, praia e papo reto — demo estereótipo.", vibe: "Sururu na panela, risada alta e orgulho do litoral nordestino.", hashtag: "alagoas" },
  { uf: "AP", stateName: "Amapá", regional: "amapaense", emoji: "🍃", tagline: "Fronteira norte, coração aberto — perfil demo.", vibe: "Mix de Amazônia e Guiana na mesa; comunidade pequena, laço grande.", hashtag: "amapa" },
  { uf: "AM", stateName: "Amazonas", regional: "amazonense", emoji: "🐟", tagline: "Rio, mercado e memória — estereótipo lúdico.", vibe: "Peixe assado, história de caboclo e rede que não vende nossa fala.", hashtag: "amazonas" },
  { uf: "BA", stateName: "Bahia", regional: { f: "baiana", m: "baiano" }, emoji: "🥁", tagline: "Axé na timeline, sem exploração — demo.", vibe: "Acarajé, samba de roda e democracia com tempero.", hashtag: "bahia", feira: { title: "Acarajé & molho de pimenta artesanal", price: "R$ 22", place: "Pelourinho, Salvador", body: "Porção para dois, feita no dia. Pix na hora, conversa de vizinho." } },
  { uf: "CE", stateName: "Ceará", regional: "cearense", emoji: "☀️", tagline: "Humor fino, sol forte — perfil estereótipo.", vibe: "Piada boa, jerimum na mão e coragem de sertão.", hashtag: "ceara" },
  { uf: "DF", stateName: "Distrito Federal", regional: "candanga", emoji: "🏛️", tagline: "Plano Piloto, coração plural — demo.", vibe: "Mistura de todo canto, churrasco de domingo e política na mesa (com respeito).", hashtag: "distritofederal" },
  { uf: "ES", stateName: "Espírito Santo", regional: "capixaba", emoji: "🌴", tagline: "Colina, café e calma — estereótipo educativo.", vibe: "Moqueca capixaba, montanha e mar no mesmo dia.", hashtag: "espiritosanto" },
  { uf: "GO", stateName: "Goiás", regional: { f: "goiana", m: "goiano" }, emoji: "🌾", tagline: "Pequi, sertão e festa — perfil demo.", vibe: "Empanado no fim de semana, pequi com respeito e hospitalidade do cerrado.", hashtag: "goias" },
  { uf: "MA", stateName: "Maranhão", regional: "maranhense", emoji: "🎭", tagline: "Bumba, reggae e história — demo.", vibe: "Tambor de crioula longe de palco vazio; cultura que merece rede própria.", hashtag: "maranhao" },
  { uf: "MT", stateName: "Mato Grosso", regional: "mato-grossense", emoji: "🐂", tagline: "Pantanal no coração — estereótipo lúdico.", vibe: "Churrasco de estrada, pôr do sol largo e pragmatismo bonito.", hashtag: "matogrosso" },
  { uf: "MS", stateName: "Mato Grosso do Sul", regional: "sul-mato-grossense", emoji: "🧉", tagline: "Tereré e fronteira — perfil demo.", vibe: "Calor seco, chimarrão gelado e gente que cumprimenta de longe.", hashtag: "matogrossodosul" },
  { uf: "MG", stateName: "Minas Gerais", regional: { f: "mineira", m: "mineiro" }, emoji: "☕", tagline: "Pão de queijo e conversa longa — demo estereótipo.", vibe: "Uai, sô — café coado, prosa sem pressa e solidariedade de vizinho.", hashtag: "minasgerais", feira: { title: "Pão de queijo & goiabada da roça", price: "R$ 30", place: "Savassi, BH", body: "Fornada mineira + potinho de doce. Retirada ou combina no DM." } },
  { uf: "PA", stateName: "Pará", regional: "paraense", emoji: "🛶", tagline: "Belém, açaí e Ver-o-Peso — demo.", vibe: "Açaí na tigela, carimbó no pé e orgulho de estuário.", hashtag: "para" },
  { uf: "PB", stateName: "Paraíba", regional: { f: "paraibana", m: "paraibano" }, emoji: "🌵", tagline: "Sertão forró e litoral — estereótipo.", vibe: "Carne de sol, frevo no coração e fé em comunidade.", hashtag: "paraiba" },
  { uf: "PR", stateName: "Paraná", regional: "paranaense", emoji: "🌲", tagline: "Pinheiro, chimarrão e ordem — demo.", vibe: "Barreado no inverno, mate amargo e trabalho bem feito.", hashtag: "parana", feira: { title: "Barreado congelado & pão caseiro", price: "R$ 38", place: "Curitiba", body: "Porção para família; combina retirada no bairro." } },
  { uf: "PE", stateName: "Pernambuco", regional: { f: "pernambucana", m: "pernambucano" }, emoji: "🎨", tagline: "Frevo, maracatu e criatividade — demo.", vibe: "Bolo de rolo na mesa, cordel na memória e revolução com docência.", hashtag: "pernambuco", feira: { title: "Bolo de rolo & doces do agreste", price: "R$ 45", place: "Recife", body: "Fatias generosas, encomenda para o fim de semana." } },
  { uf: "PI", stateName: "Piauí", regional: "piauiense", emoji: "🌞", tagline: "Sertão quente, gente forte — demo.", vibe: "Vatapá de galinha, piada seca e persistência.", hashtag: "piaui" },
  { uf: "RJ", stateName: "Rio de Janeiro", regional: "carioca", emoji: "🏖️", tagline: "Samba, brevidade e malandragem boa — demo.", vibe: "Feijoada de domingo, trilha no visual e papo na laje.", hashtag: "riodejaneiro" },
  { uf: "RN", stateName: "Rio Grande do Norte", regional: "potiguar", emoji: "🌊", tagline: "Sol, forró e sal — estereótipo.", vibe: "Ginga com tapioca, vento forte e hospitalidade de litoral.", hashtag: "riograndedonorte" },
  { uf: "RS", stateName: "Rio Grande do Sul", regional: { f: "gaúcha", m: "gaúcho" }, emoji: "🧉", tagline: "Chimarrão e tradição — perfil demo.", vibe: "Churrasco de fim de semana, chimarrão rodado e orgulho gaúcho (sem treta).", hashtag: "riograndedosul", feira: { title: "Erva-mate artesanal & cuca caseira", price: "R$ 42", place: "Porto Alegre", body: "Mate curado + fatia de cuca; apoie produtor local." } },
  { uf: "RO", stateName: "Rondônia", regional: "rondoniense", emoji: "🌳", tagline: "Madeira, migração e café — demo.", vibe: "Estrada longa, café forte e comunidade que se reinventa.", hashtag: "rondonia" },
  { uf: "RR", stateName: "Roraima", regional: "roraimense", emoji: "🏔️", tagline: "Norte extremo, acolhimento — demo.", vibe: "Fronteira, diversidade indígena e respeito na conversa.", hashtag: "roraima" },
  { uf: "SC", stateName: "Santa Catarina", regional: "catarinense", emoji: "🌊", tagline: "Praia, alemão e organização — demo.", vibe: "Sequence, ostras e festa junina com pontualidade carinhosa.", hashtag: "santacatarina" },
  { uf: "SE", stateName: "Sergipe", regional: { f: "sergipana", m: "sergipano" }, emoji: "🦀", tagline: "Menor estado, coração grande — demo.", vibe: "Caranguejo, mangue e memória afetiva de litoral.", hashtag: "sergipe" },
  { uf: "SP", stateName: "São Paulo", regional: { f: "paulistana", m: "paulistano" }, emoji: "🚇", tagline: "Metrô, pressa e pluralidade — estereótipo demo.", vibe: "Padaria 6h, trânsito eterno e solidariedade escondida no corredor.", hashtag: "saopaulo", feira: { title: "Pão na chapa & café coado kit", price: "R$ 25", place: "Vila Madalena, SP", body: "Kit café da manhã de padaria de bairro — sem app de entrega no meio." } },
  { uf: "TO", stateName: "Tocantins", regional: "tocantinense", emoji: "🌅", tagline: "Cerrado novo, raiz forte — demo.", vibe: "Pequi, pôr do sol no Jalapão e comunidade jovem.", hashtag: "tocantins" },
];

function regionalEpithet(meta, gender) {
  const key = gender === "m" ? "m" : "f";
  const word =
    typeof meta.regional === "string" ? meta.regional : meta.regional[key] || meta.regional.f;
  return `${word} ${meta.emoji}`;
}

function buildUfStereotypeSeeds() {
  const names = shuffleWithSeed(BRAZIL_COMMON_GIVEN_NAMES, UF_NAME_SHUFFLE_SEED);
  return UF_REGION_META.map((meta, i) => {
    const { displayName, gender } = names[i];
    const handle = handleFromNameAndUf(displayName, meta.uf);
    const { regional: _regional, emoji: _emoji, ...rest } = meta;
    return {
      ...rest,
      displayName,
      gender,
      handle,
      stereotypeTitle: `${displayName} ${regionalEpithet(meta, gender)}`,
    };
  });
}

export const UF_STEREOTYPE_SEEDS = buildUfStereotypeSeeds();

for (const seed of UF_STEREOTYPE_SEEDS) {
  seed.stereotypeGreeting = seed.stereotypeGreeting || STEREOTYPE_GREETING;
  seed.disclaimerNote = seed.disclaimerNote || STEREOTYPE_DISCLAIMER_NOTE;
}

export const MOCK_DEMO_UF_COUNT = UF_STEREOTYPE_SEEDS.length;
export const MOCK_DEMO_POSTS_PER_UF = 3;
export const MOCK_DEMO_TOPIC_COUNT = MOCK_DEMO_UF_COUNT * MOCK_DEMO_POSTS_PER_UF;
export const UF_ROUTE_IDS = UF_STEREOTYPE_SEEDS.map((s) => `vx_demo_${s.uf.toLowerCase()}`);

function readmeFor(seed) {
  return (
    `### ${seed.displayName} — ${seed.stereotypeTitle}\n\n` +
    `> ${seed.stereotypeGreeting}\n>\n` +
    `> **Perfil estereótipo** 🇧🇷 — só para **testes** e **humor educativo**. **Não** é pessoa real.\n\n` +
    `${seed.vibe}\n\n` +
    `- 📍 **UF:** ${seed.stateName} (${seed.uf})\n` +
    `- 🧪 Use para explorar feed, DM, Pix demo e perfil no Vox.\n`
  );
}

function pixFor(seed) {
  return `${seed.handle.replace("-", ".")}@voxbrasil.org`;
}

function buildSingleUfDemoProfile(seed, i) {
  const routeId = `vx_demo_${seed.uf.toLowerCase()}`;
  const avatarUrl = PORTRAIT(seed.gender, 10 + i);
  return {
    routeId,
    handle: seed.handle,
    name: seed.displayName,
    avatar: avatarUrl,
    avatarUrl,
    uf: seed.uf,
    stateName: seed.stateName,
    stereotypeTitle: seed.stereotypeTitle,
    stereotypeGreeting: seed.stereotypeGreeting,
    stereotypeDisclaimerNote: seed.disclaimerNote,
    bio: seed.tagline,
    pixKey: pixFor(seed),
    pinnedPostId: `demo-post-${seed.uf.toLowerCase()}`,
    readme: readmeFor(seed),
    isStereotypeDemo: true,
    stats: {
      posts: MOCK_DEMO_POSTS_PER_UF,
      peersConnected: 2 + (i % 4),
      communities: 1,
      followers: 12 + (i * 3) % 40,
      stars: 8 + (i * 2) % 30,
      isTourDemo: true,
      isStereotypeDemo: true,
    },
  };
}

export function buildUfDemoProfilesMap() {
  const map = {};
  UF_STEREOTYPE_SEEDS.forEach((seed, i) => {
    map[`vx_demo_${seed.uf.toLowerCase()}`] = buildSingleUfDemoProfile(seed, i);
  });
  return map;
}
