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
  seed.demoComments = seed.demoComments || [];
}

export const MOCK_DEMO_UF_COUNT = UF_STEREOTYPE_SEEDS.length;
export const MOCK_DEMO_POSTS_PER_UF = 3;
export const MOCK_DEMO_TOPIC_COUNT = MOCK_DEMO_UF_COUNT * MOCK_DEMO_POSTS_PER_UF;
export const UF_ROUTE_IDS = UF_STEREOTYPE_SEEDS.map((s) => `vx_demo_${s.uf.toLowerCase()}`);

/** Mídia de post por UF — tema cultural/regional (nunca retrato de avatar). */
export const postMediaByUf = {
  ac: {
    postImageUrl: "images/welcome/artista-rua.jpg",
    postAlt: "Floresta tropical — calor de porteira acreana (demo)",
  },
  al: {
    postImageUrl: "images/welcome/brinde-mesa.jpg",
    postAlt: "Praia e litoral — forró e mar alagoano (demo)",
  },
  ap: {
    postImageUrl: "images/welcome/maos-juntas.jpg",
    postAlt: "Vegetação de fronteira norte — Amapá (demo)",
  },
  am: {
    postImageUrl: "images/welcome/riso-celular.jpg",
    postAlt: "Rio e floresta — memória amazonense (demo)",
  },
  ba: {
    postImageUrl: "images/welcome/roda-amigos.jpg",
    postAlt: "Tambor e festa — axé e samba de roda baiano (demo)",
  },
  ce: {
    postImageUrl: "images/welcome/turma-notebook.jpg",
    postAlt: "Sol forte do sertão — humor e jerimum cearense (demo)",
  },
  df: {
    postImageUrl: "images/posts/tour-comunidades.jpg",
    postAlt: "Horizonte urbano — Plano Piloto e candango (demo)",
  },
  es: {
    postImageUrl: "images/posts/tour-rede.jpg",
    postAlt: "Montanhas e mar — calma capixaba (demo)",
  },
  go: {
    postImageUrl: "images/revolucao/assembleia_popular.jpg",
    postAlt: "Cerrado e campo — pequi e festa goiana (demo)",
  },
  ma: {
    postImageUrl: "images/revolucao/no_comunitario_popular.jpg",
    postAlt: "Tambores e festa popular — bumba e cultura maranhense (demo)",
  },
  mt: {
    postImageUrl: "images/welcome/artista-rua.jpg",
    postAlt: "Pôr do sol no campo — Pantanal mato-grossense (demo)",
  },
  ms: {
    postImageUrl: "images/welcome/brinde-mesa.jpg",
    postAlt: "Paisagem de planície — tereré e fronteira sul-mato-grossense (demo)",
  },
  mg: {
    postImageUrl: "images/welcome/maos-juntas.jpg",
    postAlt: "Café coado — prosa mineira sem pressa (demo)",
  },
  pa: {
    postImageUrl: "images/welcome/riso-celular.jpg",
    postAlt: "Barco no estuário — açaí e Ver-o-Peso paraense (demo)",
  },
  pb: {
    postImageUrl: "images/welcome/roda-amigos.jpg",
    postAlt: "Sertão e litoral — forró paraibano (demo)",
  },
  pr: {
    postImageUrl: "images/welcome/turma-notebook.jpg",
    postAlt: "Mata de pinheiros — chimarrão paranaense (demo)",
  },
  pe: {
    postImageUrl: "images/posts/tour-comunidades.jpg",
    postAlt: "Cores de frevo e maracatu — criatividade pernambucana (demo)",
  },
  pi: {
    postImageUrl: "images/posts/tour-rede.jpg",
    postAlt: "Estrada no sertão — persistência piauiense (demo)",
  },
  rj: {
    postImageUrl: "images/revolucao/assembleia_popular.jpg",
    postAlt: "Orla e morros — samba carioca (demo)",
  },
  rn: {
    postImageUrl: "images/revolucao/no_comunitario_popular.jpg",
    postAlt: "Dunas e vento — litoral potiguar (demo)",
  },
  rs: {
    postImageUrl: "images/welcome/artista-rua.jpg",
    postAlt: "Campanha gaúcha — chimarrão e tradição (demo)",
  },
  ro: {
    postImageUrl: "images/welcome/brinde-mesa.jpg",
    postAlt: "Estrada e café — comunidade rondoniense (demo)",
  },
  rr: {
    postImageUrl: "images/welcome/maos-juntas.jpg",
    postAlt: "Montanhas do norte — acolhimento roraimense (demo)",
  },
  sc: {
    postImageUrl: "images/welcome/riso-celular.jpg",
    postAlt: "Costa organizada — praia catarinense (demo)",
  },
  se: {
    postImageUrl: "images/welcome/roda-amigos.jpg",
    postAlt: "Mesinha com frutos do mar — litoral sergipano (demo)",
  },
  sp: {
    postImageUrl: "images/welcome/turma-notebook.jpg",
    postAlt: "Skyline urbano — metrô e pluralidade paulistana (demo)",
  },
  to: {
    postImageUrl: "images/posts/tour-comunidades.jpg",
    postAlt: "Nascer do sol no cerrado — Jalapão tocantinense (demo)",
  },
};

const POST_MEDIA_ALT_URLS = [
  "images/posts/tour-rede.jpg",
  "images/revolucao/assembleia_popular.jpg",
  "images/revolucao/no_comunitario_popular.jpg",
  "images/welcome/artista-rua.jpg",
  "images/welcome/brinde-mesa.jpg",
  "images/welcome/maos-juntas.jpg",
  "images/welcome/riso-celular.jpg",
  "images/welcome/roda-amigos.jpg",
];

function ensureTriplePostMedia() {
  const keys = Object.keys(postMediaByUf);
  keys.forEach((k, i) => {
    let entry = postMediaByUf[k];
    if (!Array.isArray(entry)) entry = [entry];
    while (entry.length < MOCK_DEMO_POSTS_PER_UF) {
      const slot = entry.length;
      const src = entry[0];
      entry.push({
        postImageUrl: POST_MEDIA_ALT_URLS[(i + slot * 5) % POST_MEDIA_ALT_URLS.length],
        postAlt: `${src.postAlt.replace(/\s*\(demo\)\s*$/, "")} — foto ${slot + 1} (demo)`,
      });
    }
    postMediaByUf[k] = entry;
  });
}
ensureTriplePostMedia();

/** Corpo dos posts demo UF — voz regional (disclaimer só no perfil). */
export const UF_DEMO_POST_COPY = {
  ac:
    "🌳 Rio Branco no bolso e tacacá na memória: porteira aberta, conversa longa e floresta que a gente defende com orgulho, não com meme ofensivo. " +
    "Acre é fronteira calorosa — migração, borracha na história e hospitalidade que não precisa de filtro patrocinado pra aparecer. " +
    "Conta aí: qual cheiro ou som te lembra casa no interior? Clichê leve, respeito sempre.",
  al:
    "🌊 Maceió no coração e sururu na panela: forró de terreiro, risada alta e mar que não cabe num story de 15 segundos. " +
    "Alagoas é litoral nordestino com papo reto — festa, família e orgulho sem zombaria de quem veio de outro estado. " +
    "Manda um emoji de praia e diz qual música alagoana você colocaria na trilha da comunidade.",
  ap:
    "🍃 Macapá mistura Amazônia e Guiana na mesma mesa — comunidade pequena, laço grande, fronteira que ensina a ouvir antes de falar. " +
    "Aqui a demo é sobre voz do norte extremo com carinho: natureza, mistura cultural e zero caricatura de quem mora de verdade. " +
    "Se você já cruzou fronteira de barco ou estrada, conta como foi — história real vale mais que estereótipo vazio.",
  am:
    "🐟 Manaus cheira a peixe assado no mercado e história de caboclo que não deveria sumir da timeline por algoritmo estrangeiro. " +
    "Amazonas é rio, floresta e memória compartilhada — rede nossa quando a conversa é de respeito e não de ridicularizar sotaque. " +
    "Qual igarapé, festa ou prato te conecta com o norte? Bora trocar cultura sem empurrar briga.",
  ba:
    "🥁 Salvador pulsa axé, acarajé quente e samba de roda que não aceita palco vazio nem exploração de tradição. " +
    "Bahia é democracia com tempero: religião, música e comida de rua contadas na nossa voz, clichê leve e carinho grande. " +
    "Pelourinho ou orla — onde você começaria um tour honesto pelo seu bairro? Responde com emoji e respeito.",
  ce:
    "☀️ Sol cearense bate forte, jerimum na mão e humor fino que desarma treta — piada boa, nunca humilhação. " +
    "Ceará é sertão corajoso e litoral acolhedor; aqui a gente testa rede com coragem de quem enfrenta seca e ainda abre a porta. " +
    "Manda uma piada limpa ou um orgulho cearense que cabe num post sem impulsionar ninguém pra fora da conversa.",
  df:
    "🏛️ Candanga de todo canto: Plano Piloto no horizonte, churrasco de domingo e política na mesa — sempre com respeito, nunca com ódio performático. " +
    "DF é pluralidade real: interior goiano, nordeste, sul — mistura que funciona quando a rede é nossa. " +
    "De onde você veio pra Brasília e o que trouxe na mochila além do CPF? História de migração também é identidade.",
  es:
    "🌴 Colina, café coado e moqueca capixaba: calma que não é frieza — é ritmo de quem divide montanha e mar no mesmo dia. " +
    "Espírito Santo cabe no prato e na prosa: clichê capixaba leve, hospitalidade de vizinho, zero zombaria de quem fala devagar. " +
    "Vitória, Vila Velha ou roça — qual vista te representa? Comenta com emoji de paz.",
  go:
    "🌾 Goiás no peito: pequi com respeito, empanado de fim de semana e festa de interior que lota praça sem precisar de anúncio. " +
    "Cerrado é raiz forte — calor, estrada e gente que cumprimenta de longe e senta perto na hora do café. " +
    "Qual cantor goiano ou prato do cerrado você colocaria na trilha desta comunidade? Uai, digo: bora conversar.",
  ma:
    "🎭 São Luís respira bumba-meuboi na calçada e reggae que desce pro centro sem pedir licença de plataforma gringa. " +
    "Tambor de crioula longe de palco vazio — cultura maranhense que merece rede própria, memória afetiva e thread de respeito. " +
    "Qual festa popular do seu estado combina com nosso toque maranhense? Clichê leve, nunca maldade — vem testar a timeline comigo.",
  mt:
    "🐂 Pantanal no coração: pôr do sol largo, churrasco de estrada e pragmatismo bonito de quem sabe esperar a chuva. " +
    "Mato Grosso é campo, rio e boiada na memória — demo pra mostrar voz do centro-oeste sem virar piada de interior. " +
    "Já viu jacaré na beira da estrada ou só no documentário? Conta sem exagerar — respeito ao bioma primeiro.",
  ms:
    "🧉 Tereré gelado na mão, calor seco e fronteira que aprendeu a cumprimentar antes de negociar. " +
    "Sul Mato-Grossense é chimarrão compartilhado e estrada reta — comunidade que não precisa de algoritmo pra achar vizinho. " +
    "Mate amargo ou doce? Responde e diz de qual cidade interior você sente falta quando viaja.",
  mg:
    "☕ Uai, sô — café coado, pão de queijo quente e prosa sem pressa na varanda. " +
    "Minas é solidariedade de vizinho: cidade histórica, serra e interior que cabe num post longo sem repetir footer de plataforma. " +
    "BH, Triângulo ou Vale — qual sotaque mineiro você acha bonito (e não motivo de piada)? Bora manter a conversa honesta.",
  pa:
    "🛶 Belém cheira Ver-o-Peso, açaí na tigela grossa e carimbó no pé — estuário que não cabe em template gringo de feed. " +
    "Pará é rio, mangue e orgulho paraense contado na nossa voz; clichê de açaí sim, zombaria de povo não. " +
    "Manaus ou Belém — o que sua região tem em comum com a nossa mesa? Troca cultura aqui embaixo 👇",
  pb:
    "🌵 Paraíba de sertão quente e litoral ventoso: carne de sol, forró no coração e fé em comunidade que segura o vizinho. " +
    "João Pessoa ou Campina — cada canto tem meme afetivo, não bullying regional. " +
    "Qual frevo ou moda de viola te lembra domingo em família? Emoji de sol e respeito.",
  pr:
    "🌲 Pinheiro, chimarrão amargo e barreado no inverno — Paraná é ordem carinhosa e trabalho bem feito, não troça de sotaque. " +
    "Curitiba e interior: mate rodado, estrada bonita e orgulho paranaense leve o bastante pra demo educativa. " +
    "Litoral ou planalto — onde você congelaria um barreado pra dividir na feira demo?",
  pe:
    "🎨 Recife colorido: frevo no passo, maracatu na memória e bolo de rolo fatia generosa na mesa. " +
    "Pernambuco é criatividade com docência — revolução cantada, cordel no bolso, zero ridicularizar nordeste. " +
    "Olinda ou Porto de Galinhas — qual bloco você entraria sem pagar impulsionamento? Só conversa boa.",
  pi:
    "🌞 Sertão piauiense quente e gente forte: vatapá de galinha, piada seca e persistência que não pede palco vazio. " +
    "Piauí cabe no prato e na história — demo pra lembrar que estado pequeno no mapa não é pequeno na cultura. " +
    "Teresina ou interior — o que te orgulha do PI sem diminuir o vizinho? Responde com carinho.",
  rj:
    "🏖️ Laje, samba e trilha no visual: carioca é brevidade na fala e solidariedade escondida no corredor do prédio. " +
    "Feijoada de domingo, malandragem boa (a que ajuda) e orgulho de morro e orla na mesma timeline honesta. " +
    "Copacabana ou Madureira — qual ritmo carioca você colocaria no primeiro post da sua comunidade?",
  rn:
    "🌊 Potiguar de vento forte: tapioca na chapa, forró no sal e sol que convida conversa na areia. " +
    "Rio Grande do Norte é ginga e hospitalidade de litoral — clichê de dunas sim, desrespeito nunca. " +
    "Natal ou Mossoró — manda emoji de onda e diz qual cantor potiguar merece thread própria.",
  rs:
    "🧉 Chimarrão rodado, churrasco de fim de semana e campanha no horizonte — gaúcho com orgulho, sem treta com outro estado. " +
    "Rio Grande do Sul é tradição compartilhada: cultura, mate e abraço pro norte quando a conversa é fraterna. " +
    "Porto Alegre ou interior — qual trilha gaúcha combina com demo de rede comunitária? Sem impulsionar, só trocar ideia.",
  ro:
    "🌳 Estrada longa, café forte e comunidade rondoniense que se reinventa sem esquecer quem chegou primeiro. " +
    "Madeira, migração e floresta — voz do norte oeste contada com respeito, não com piada de atraso. " +
    "Porto Velho na memória: o que sua cidade aprendeu com quem veio de fora? História real > estereótipo.",
  rr:
    "🏔️ Roraima no extremo norte: montanha, diversidade indígena e acolhimento que começa ouvindo. " +
    "Fronteira e respeito caminham juntos — demo pra testar conversa séria sobre território sem caricatura. " +
    "Boa Vista ou interior — qual paisagem te lembra que Brasil é continental? Comenta com reverência.",
  sc:
    "🌊 Praia organizada, ostra no prato e festa junina pontual — catarinense é sequence no passo e carinho no detalhe. " +
    "Santa Catarina mistura litoral alemão e sotaque doce sem virar troça de migrante — clichê leve, inclusão real. " +
    "Florianópolis ou serra — onde você serviria o primeiro café demo da comunidade?",
  se:
    "🦀 Menor estado, coração grande: caranguejo, mangue e memória afetiva de litoral que cabe num abraço. " +
    "Sergipe é proximidade — todo mundo conhece alguém que conhece alguém; perfeito pra testar rede local honesta. " +
    "Aracaju na veia: qual cheiro de mar te traz de volta? Emoji de caranguejo permitido 🦀",
  sp:
    "🚇 Paulistano no corre: padaria 6h, metrô lotado e pluralidade que cabe num vagão — pressa sim, solidariedade também. " +
    "São Paulo é bairro, migração e café coado no intervalo — demo sem reduzir cidade a meme de frieza. " +
    "Qual linha de metrô ou bairro te representa? Responde rápido (é o estilo) mas com respeito.",
  to:
    "🌅 Jalapão no coração: pequi, pôr do sol no cerrado e comunidade jovem plantando raiz onde antes só passava estrada. " +
    "Tocantins é estado novo com memória antiga do cerrado — clichê de paisagem sim, desrespeito ao bioma não. " +
    "Palmas ou interior — o que você defende quando falam mal do norte central? Voz firme, tom leve.",
};

export function ufDemoPostId(uf, slot) {
  const u = String(uf).toLowerCase();
  if (slot === 0) return `demo-post-${u}`;
  return `demo-post-${u}-${slot + 1}`;
}

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

const UF_DEMO_PAIR_COPY = {
  "CE-MA":
    "Davi cearense na área! 🌞 Seu bumba e reggae maranhense conversam bem com nosso forró de terreiro — aqui no Vox a gente troca cultura sem algoritmo empurrando briga. Quando rolar festa em São Luís, manda o convite que eu levo jerimum na mochila (e piada boa, claro).",
  "BA-MA":
    "Paulo baiano passando! 🥁 Tambor de crioula e axé são primos de parente — adorei você falar de memória que não some da timeline. Vox é rede de respeito: comida, música e história, nunca zombaria de quem é de verdade.",
  "RS-MA":
    "Rafael gaúcho aqui — chimarrão virtual na mão. 🧉 Reggae do Maranhão já fez amizade com trilha no pampa em playlist minha; no Vox a conversa fica na comunidade, sem impulsionar post. Abraço pro norte com carinho de sul.",
  "PA-MA":
    "Amanda paraense chegando de Belém! 🛶 Açaí na tigela e carimbó no pé — São Luís no coração. Que bom ver voz do MA sem plataforma gringa decidindo alcance. Tamo junto na demo, sempre com respeito.",
  "MA-MA":
    "Marcos maranhense respondendo: valeu, galera de todo canto! 🎭 Bumba, reggae e hospitalidade maranhense ficam mais fortes quando a rede é nossa. Sigam testando o Vox — clichê leve, nunca maldade.",
  "SP-MG":
    "Lucas paulistano no corre do metrô 🚇 — mas parei pra ler, Alice. Pão de queijo mineiro já salvou muitos almoços na Paulista; aqui no Vox organizamos sem pedir licença pro algoritmo. Uai sô, respeito total!",
  "BA-AM":
    "Paulo baiano de coração! 🐟 Peixe assado amazonense lembra acarajé de domingo — memória nossa não vira treino de IA sem consentimento. Fechado com você, vizinha de floresta!",
  "RJ-CE":
    "Gabriel carioca na laje: piada boa, Davi! 🏖️ Sol cearense e humor fino cabem na mesma timeline — governança transparente é coisa séria, mas com leveza. Bora manter o Vox honesto.",
};

function ufRoute(uf) {
  return `vx_demo_${String(uf).toLowerCase()}`;
}

function replyRow({ id, hostUf, fromUf, body, replyToPostId, reactionsCount = 0 }) {
  const host = String(hostUf).toLowerCase();
  return {
    id,
    replyTo: replyToPostId || ufDemoPostId(host, 0),
    communityId: "demo-aprenda-vox",
    body,
    author: ufRoute(fromUf),
    owner: ufRoute(fromUf),
    isLocalP2p: true,
    reactionsCount: Number(reactionsCount) || 0,
  };
}

function respectfulBanter(from, host, slot) {
  const pair = UF_DEMO_PAIR_COPY[`${from.uf}-${host.uf}`];
  if (pair) return pair;
  const hooks = [
    `${from.displayName} (${from.uf}) na thread: ${from.vibe.split(".")[0]}. — e torço pela voz de ${host.stateName} aqui no Vox, sem algoritmo estrangeiro apagando post. 🤝`,
    `Opa, ${host.displayName}! Chego de ${from.stateName} com ${from.stereotypeTitle.replace(/^[^ ]+ /, "")} no bolso. Clichê leve, carinho grande — demo só pra ensinar a plataforma. 😊`,
    `Passando de ${from.stateName} pra dizer: ${from.tagline} Adorei seu recado sobre comunidade local — é isso que a gente quer testar no Vox.`,
  ];
  return hooks[slot % hooks.length];
}

function handcraftedUfReplies() {
  return [
    replyRow({ id: "demo-reply-sp-mg", hostUf: "mg", fromUf: "sp", body: UF_DEMO_PAIR_COPY["SP-MG"] }),
    replyRow({ id: "demo-reply-ba-am", hostUf: "am", fromUf: "ba", body: UF_DEMO_PAIR_COPY["BA-AM"] }),
    replyRow({ id: "demo-reply-rj-ce", hostUf: "ce", fromUf: "rj", body: UF_DEMO_PAIR_COPY["RJ-CE"] }),
    replyRow({ id: "demo-reply-ce-ma-0", hostUf: "ma", fromUf: "ce", body: UF_DEMO_PAIR_COPY["CE-MA"] }),
    replyRow({ id: "demo-reply-ba-ma-0", hostUf: "ma", fromUf: "ba", body: UF_DEMO_PAIR_COPY["BA-MA"], replyToPostId: undefined, reactionsCount: 3 }),
    replyRow({ id: "demo-reply-rs-ma-0", hostUf: "ma", fromUf: "rs", body: UF_DEMO_PAIR_COPY["RS-MA"] }),
    replyRow({ id: "demo-reply-pa-ma-1", hostUf: "ma", fromUf: "pa", body: UF_DEMO_PAIR_COPY["PA-MA"] }),
    replyRow({ id: "demo-reply-ma-thanks", hostUf: "ma", fromUf: "ma", body: UF_DEMO_PAIR_COPY["MA-MA"] }),
  ];
}

export function attachDemoCommentsToSeeds(replies) {
  for (const seed of UF_STEREOTYPE_SEEDS) {
    const postId = `demo-post-${seed.uf.toLowerCase()}`;
    seed.demoComments = replies
      .filter((r) => r.replyTo === postId)
      .map((r) => ({ id: r.id, author: r.author, body: r.body }));
  }
}

function populateSyntheticRepliesForHost(host, i, replies, seenIds, perPost) {
  const n = UF_STEREOTYPE_SEEDS.length;
  for (let postSlot = 0; postSlot < MOCK_DEMO_POSTS_PER_UF; postSlot++) {
    const postId = ufDemoPostId(host.uf, postSlot);
    const targetPerPost = postSlot === 0 ? 3 : 2;
    let slot = 0;
    while ((perPost[postId] || 0) < targetPerPost && slot < 12) {
      const j = (i + 1 + postSlot * 3 + slot * 7) % n;
      slot += 1;
      if (UF_STEREOTYPE_SEEDS[j].uf === host.uf) continue;
      const from = UF_STEREOTYPE_SEEDS[j];
      const id = `demo-reply-${from.uf.toLowerCase()}-${host.uf.toLowerCase()}-s${postSlot}-${slot}`;
      if (seenIds.has(id)) continue;
      replies.push(
        replyRow({ id, hostUf: host.uf, fromUf: from.uf, body: respectfulBanter(from, host, slot + postSlot), replyToPostId: postId }),
      );
      seenIds.add(id);
      perPost[postId] = (perPost[postId] || 0) + 1;
    }
  }
}

export function buildUfDemoReplies() {
  const replies = handcraftedUfReplies();
  const seenIds = new Set(replies.map((r) => r.id));
  const perPost = {};
  for (const r of replies) {
    perPost[r.replyTo] = (perPost[r.replyTo] || 0) + 1;
  }

  UF_STEREOTYPE_SEEDS.forEach((host, i) => {
    populateSyntheticRepliesForHost(host, i, replies, seenIds, perPost);
  });

  attachDemoCommentsToSeeds(replies);
  return replies;
}
