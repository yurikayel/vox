/**
 * Perfis demo estereótipo — um por UF (27).
 * Nomes próprios: referência educativa a rankings públicos de registros civis / IBGE por região.
 * Avatares: randomuser.me; fallback de iniciais no onerror do <img>.
 */

const PORTRAIT = (gender, n) =>
  `https://randomuser.me/api/portraits/med/${gender === "m" ? "men" : "women"}/${n % 100}.jpg`;

export const UF_STEREOTYPE_SEEDS = [
  { uf: "AC", stateName: "Acre", displayName: "Maria", gender: "f", handle: "maria-ac", stereotypeTitle: "Maria acreana 🌳", tagline: "Calor de porteira aberta — perfil estereótipo demo.", vibe: "Tacacá na conversa, floresta perto e hospitalidade que não cabe no algoritmo.", hashtag: "acre" },
  { uf: "AL", stateName: "Alagoas", displayName: "José", gender: "m", handle: "jose-al", stereotypeTitle: "José alagoano 🌊", tagline: "Forró, praia e papo reto — demo estereótipo.", vibe: "Sururu na panela, risada alta e orgulho do litoral nordestino.", hashtag: "alagoas" },
  { uf: "AP", stateName: "Amapá", displayName: "Ana", gender: "f", handle: "ana-ap", stereotypeTitle: "Ana amapaense 🍃", tagline: "Fronteira norte, coração aberto — perfil demo.", vibe: "Mix de Amazônia e Guiana na mesa; comunidade pequena, laço grande.", hashtag: "amapa" },
  { uf: "AM", stateName: "Amazonas", displayName: "Maria", gender: "f", handle: "maria-am", stereotypeTitle: "Maria amazonense 🐟", tagline: "Rio, mercado e memória — estereótipo lúdico.", vibe: "Peixe assado, história de caboclo e rede que não vende nossa fala.", hashtag: "amazonas" },
  { uf: "BA", stateName: "Bahia", displayName: "Maria", gender: "f", handle: "maria-ba", stereotypeTitle: "Maria baiana 🥁", tagline: "Axé na timeline, sem exploração — demo.", vibe: "Acarajé, samba de roda e democracia com tempero.", hashtag: "bahia", feira: { title: "Acarajé & molho de pimenta artesanal", price: "R$ 22", place: "Pelourinho, Salvador", body: "Porção para dois, feita no dia. Pix na hora, conversa de vizinho." } },
  { uf: "CE", stateName: "Ceará", displayName: "Francisco", gender: "m", handle: "francisco-ce", stereotypeTitle: "Francisco cearense ☀️", tagline: "Humor fino, sol forte — perfil estereótipo.", vibe: "Piada boa, jerimum na mão e coragem de sertão.", hashtag: "ceara" },
  { uf: "DF", stateName: "Distrito Federal", displayName: "Maria", gender: "f", handle: "maria-df", stereotypeTitle: "Maria candanga 🏛️", tagline: "Plano Piloto, coração plural — demo.", vibe: "Mistura de todo canto, churrasco de domingo e política na mesa (com respeito).", hashtag: "distritofederal" },
  { uf: "ES", stateName: "Espírito Santo", displayName: "João", gender: "m", handle: "joao-es", stereotypeTitle: "João capixaba 🌴", tagline: "Colina, café e calma — estereótipo educativo.", vibe: "Moqueca capixaba, montanha e mar no mesmo dia.", hashtag: "espiritosanto" },
  { uf: "GO", stateName: "Goiás", displayName: "Maria", gender: "f", handle: "maria-go", stereotypeTitle: "Maria goiana 🌾", tagline: "Pequi, sertão e festa — perfil demo.", vibe: "Empanado no fim de semana, pequi com respeito e hospitalidade do cerrado.", hashtag: "goias" },
  { uf: "MA", stateName: "Maranhão", displayName: "José", gender: "m", handle: "jose-ma", stereotypeTitle: "José maranhense 🎭", tagline: "Bumba, reggae e história — demo.", vibe: "Tambor de crioula longe de palco vazio; cultura que merece rede própria.", hashtag: "maranhao" },
  { uf: "MT", stateName: "Mato Grosso", displayName: "Maria", gender: "f", handle: "maria-mt", stereotypeTitle: "Maria mato-grossense 🐂", tagline: "Pantanal no coração — estereótipo lúdico.", vibe: "Churrasco de estrada, pôr do sol largo e pragmatismo bonito.", hashtag: "matogrosso" },
  { uf: "MS", stateName: "Mato Grosso do Sul", displayName: "Maria", gender: "f", handle: "maria-ms", stereotypeTitle: "Maria sul-mato-grossense 🧉", tagline: "Tereré e fronteira — perfil demo.", vibe: "Calor seco, chimarrão gelado e gente que cumprimenta de longe.", hashtag: "matogrossodosul" },
  { uf: "MG", stateName: "Minas Gerais", displayName: "Maria", gender: "f", handle: "maria-mg", stereotypeTitle: "Maria mineira ☕", tagline: "Pão de queijo e conversa longa — demo estereótipo.", vibe: "Uai, sô — café coado, prosa sem pressa e solidariedade de vizinho.", hashtag: "minasgerais", feira: { title: "Pão de queijo & goiabada da roça", price: "R$ 30", place: "Savassi, BH", body: "Fornada mineira + potinho de doce. Retirada ou combina no DM." } },
  { uf: "PA", stateName: "Pará", displayName: "José", gender: "m", handle: "jose-pa", stereotypeTitle: "José paraense 🛶", tagline: "Belém, açaí e Ver-o-Peso — demo.", vibe: "Açaí na tigela, carimbó no pé e orgulho de estuário.", hashtag: "para" },
  { uf: "PB", stateName: "Paraíba", displayName: "Maria", gender: "f", handle: "maria-pb", stereotypeTitle: "Maria paraibana 🌵", tagline: "Sertão forró e litoral — estereótipo.", vibe: "Carne de sol, frevo no coração e fé em comunidade.", hashtag: "paraiba" },
  { uf: "PR", stateName: "Paraná", displayName: "Maria", gender: "f", handle: "maria-pr", stereotypeTitle: "Maria paranaense 🌲", tagline: "Pinheiro, chimarrão e ordem — demo.", vibe: "Barreado no inverno, mate amargo e trabalho bem feito.", hashtag: "parana", feira: { title: "Barreado congelado & pão caseiro", price: "R$ 38", place: "Curitiba", body: "Porção para família; combina retirada no bairro." } },
  { uf: "PE", stateName: "Pernambuco", displayName: "Maria", gender: "f", handle: "maria-pe", stereotypeTitle: "Maria pernambucana 🎨", tagline: "Frevo, maracatu e criatividade — demo.", vibe: "Bolo de rolo na mesa, cordel na memória e revolução com docência.", hashtag: "pernambuco", feira: { title: "Bolo de rolo & doces do agreste", price: "R$ 45", place: "Recife", body: "Fatias generosas, encomenda para o fim de semana." } },
  { uf: "PI", stateName: "Piauí", displayName: "José", gender: "m", handle: "jose-pi", stereotypeTitle: "José piauiense 🌞", tagline: "Sertão quente, gente forte — demo.", vibe: "Vatapá de galinha, piada seca e persistência.", hashtag: "piaui" },
  { uf: "RJ", stateName: "Rio de Janeiro", displayName: "João", gender: "m", handle: "joao-rj", stereotypeTitle: "João carioca 🏖️", tagline: "Samba, brevidade e malandragem boa — demo.", vibe: "Feijoada de domingo, trilha no visual e papo na laje.", hashtag: "riodejaneiro" },
  { uf: "RN", stateName: "Rio Grande do Norte", displayName: "Maria", gender: "f", handle: "maria-rn", stereotypeTitle: "Maria potiguar 🌊", tagline: "Sol, forró e sal — estereótipo.", vibe: "Ginga com tapioca, vento forte e hospitalidade de litoral.", hashtag: "riograndedonorte" },
  { uf: "RS", stateName: "Rio Grande do Sul", displayName: "João", gender: "m", handle: "joao-rs", stereotypeTitle: "João gaúcho 🧉", tagline: "Chimarrão e tradição — perfil demo.", vibe: "Churrasco de fim de semana, chimarrão rodado e orgulho gaúcho (sem treta).", hashtag: "riograndedosul", feira: { title: "Erva-mate artesanal & cuca caseira", price: "R$ 42", place: "Porto Alegre", body: "Mate curado + fatia de cuca; apoie produtor local." } },
  { uf: "RO", stateName: "Rondônia", displayName: "Maria", gender: "f", handle: "maria-ro", stereotypeTitle: "Maria rondoniense 🌳", tagline: "Madeira, migração e café — demo.", vibe: "Estrada longa, café forte e comunidade que se reinventa.", hashtag: "rondonia" },
  { uf: "RR", stateName: "Roraima", displayName: "Maria", gender: "f", handle: "maria-rr", stereotypeTitle: "Maria roraimense 🏔️", tagline: "Norte extremo, acolhimento — demo.", vibe: "Fronteira, diversidade indígena e respeito na conversa.", hashtag: "roraima" },
  { uf: "SC", stateName: "Santa Catarina", displayName: "Maria", gender: "f", handle: "maria-sc", stereotypeTitle: "Maria catarinense 🌊", tagline: "Praia, alemão e organização — demo.", vibe: "Sequence, ostras e festa junina com pontualidade carinhosa.", hashtag: "santacatarina" },
  { uf: "SE", stateName: "Sergipe", displayName: "Maria", gender: "f", handle: "maria-se", stereotypeTitle: "Maria sergipana 🦀", tagline: "Menor estado, coração grande — demo.", vibe: "Caranguejo, mangue e memória afetiva de litoral.", hashtag: "sergipe" },
  { uf: "SP", stateName: "São Paulo", displayName: "João", gender: "m", handle: "joao-sp", stereotypeTitle: "João paulistano 🚇", tagline: "Metrô, pressa e pluralidade — estereótipo demo.", vibe: "Padaria 6h, trânsito eterno e solidariedade escondida no corredor.", hashtag: "saopaulo", feira: { title: "Pão na chapa & café coado kit", price: "R$ 25", place: "Vila Madalena, SP", body: "Kit café da manhã de padaria de bairro — sem app de entrega no meio." } },
  { uf: "TO", stateName: "Tocantins", displayName: "Maria", gender: "f", handle: "maria-to", stereotypeTitle: "Maria tocantinense 🌅", tagline: "Cerrado novo, raiz forte — demo.", vibe: "Pequi, pôr do sol no Jalapão e comunidade jovem.", hashtag: "tocantins" },
];

export const MOCK_DEMO_UF_COUNT = UF_STEREOTYPE_SEEDS.length;
export const UF_ROUTE_IDS = UF_STEREOTYPE_SEEDS.map((s) => `vx_demo_${s.uf.toLowerCase()}`);

/** Mídia de post por UF — tema cultural/regional (nunca retrato de avatar). */
export const postMediaByUf = {
  ac: {
    postImageUrl: "https://images.unsplash.com/photo-1448375249986-3937330462b7?w=800&q=80",
    postAlt: "Floresta tropical — calor de porteira acreana (demo)",
  },
  al: {
    postImageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
    postAlt: "Praia e litoral — forró e mar alagoano (demo)",
  },
  ap: {
    postImageUrl: "https://images.unsplash.com/photo-1518173946687-a4c0362aee7f?w=800&q=80",
    postAlt: "Vegetação de fronteira norte — Amapá (demo)",
  },
  am: {
    postImageUrl: "https://images.unsplash.com/photo-1585314152723-904fc4f4d312?w=800&q=80",
    postAlt: "Rio e floresta — memória amazonense (demo)",
  },
  ba: {
    postImageUrl: "https://images.unsplash.com/photo-1545389336-cf090694435e?w=800&q=80",
    postAlt: "Tambor e festa — axé e samba de roda baiano (demo)",
  },
  ce: {
    postImageUrl: "https://images.unsplash.com/photo-1509316785289-025f5b846b8f?w=800&q=80",
    postAlt: "Sol forte do sertão — humor e jerimum cearense (demo)",
  },
  df: {
    postImageUrl: "https://images.unsplash.com/photo-1546550547-93d4e4c6b5e1?w=800&q=80",
    postAlt: "Horizonte urbano — Plano Piloto e candango (demo)",
  },
  es: {
    postImageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
    postAlt: "Montanhas e mar — calma capixaba (demo)",
  },
  go: {
    postImageUrl: "https://images.unsplash.com/photo-1500382017468-90403deda075?w=800&q=80",
    postAlt: "Cerrado e campo — pequi e festa goiana (demo)",
  },
  ma: {
    postImageUrl: "https://images.unsplash.com/photo-1519892306449-f6395edf9ebe?w=800&q=80",
    postAlt: "Tambores e festa popular — bumba e cultura maranhense (demo)",
  },
  mt: {
    postImageUrl: "https://images.unsplash.com/photo-1500595040049-30c4151484bf?w=800&q=80",
    postAlt: "Pôr do sol no campo — Pantanal mato-grossense (demo)",
  },
  ms: {
    postImageUrl: "https://images.unsplash.com/photo-1439066615861-d1bef174757f?w=800&q=80",
    postAlt: "Paisagem de planície — tereré e fronteira sul-mato-grossense (demo)",
  },
  mg: {
    postImageUrl: "https://images.unsplash.com/photo-1497935586351-b67026826061?w=800&q=80",
    postAlt: "Café coado — prosa mineira sem pressa (demo)",
  },
  pa: {
    postImageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80",
    postAlt: "Barco no estuário — açaí e Ver-o-Peso paraense (demo)",
  },
  pb: {
    postImageUrl: "https://images.unsplash.com/photo-1509316975858-15e1b34a7649?w=800&q=80",
    postAlt: "Sertão e litoral — forró paraibano (demo)",
  },
  pr: {
    postImageUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
    postAlt: "Mata de pinheiros — chimarrão paranaense (demo)",
  },
  pe: {
    postImageUrl: "https://images.unsplash.com/photo-1533174078815-4f917a568892?w=800&q=80",
    postAlt: "Cores de frevo e maracatu — criatividade pernambucana (demo)",
  },
  pi: {
    postImageUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80",
    postAlt: "Estrada no sertão — persistência piauiense (demo)",
  },
  rj: {
    postImageUrl: "https://images.unsplash.com/photo-1483728642382-8ead366eed7a?w=800&q=80",
    postAlt: "Orla e morros — samba carioca (demo)",
  },
  rn: {
    postImageUrl: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80",
    postAlt: "Dunas e vento — litoral potiguar (demo)",
  },
  rs: {
    postImageUrl: "https://images.unsplash.com/photo-1416879595882-3383a0488b5b?w=800&q=80",
    postAlt: "Campanha gaúcha — chimarrão e tradição (demo)",
  },
  ro: {
    postImageUrl: "https://images.unsplash.com/photo-1518837695015-87179a5f262a?w=800&q=80",
    postAlt: "Estrada e café — comunidade rondoniense (demo)",
  },
  rr: {
    postImageUrl: "https://images.unsplash.com/photo-1464822759023-fed62297fa48?w=800&q=80",
    postAlt: "Montanhas do norte — acolhimento roraimense (demo)",
  },
  sc: {
    postImageUrl: "https://images.unsplash.com/photo-1571115764595-39278f141678?w=800&q=80",
    postAlt: "Costa organizada — praia catarinense (demo)",
  },
  se: {
    postImageUrl: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80",
    postAlt: "Mesinha com frutos do mar — litoral sergipano (demo)",
  },
  sp: {
    postImageUrl: "https://images.unsplash.com/photo-1444723127015-bd81fda2d572?w=800&q=80",
    postAlt: "Skyline urbano — metrô e pluralidade paulistana (demo)",
  },
  to: {
    postImageUrl: "https://images.unsplash.com/photo-1470071450284-b48dbe1b276b?w=800&q=80",
    postAlt: "Nascer do sol no cerrado — Jalapão tocantinense (demo)",
  },
};

function readmeFor(seed) {
  return (
    `### ${seed.displayName} — ${seed.stereotypeTitle}\n\n` +
    `> **Perfil estereótipo** 🇧🇷 — só para **testes** e **humor educativo**. **Não** é pessoa real.\n\n` +
    `${seed.vibe}\n\n` +
    `- 📍 **UF:** ${seed.stateName} (${seed.uf})\n` +
    `- 🧪 Use para explorar feed, DM, Pix demo e perfil no Vox.\n`
  );
}

function pixFor(seed) {
  return `${seed.handle.replace("-", ".")}@voxbrasil.org`;
}

export function buildUfDemoProfilesMap() {
  const map = {};
  UF_STEREOTYPE_SEEDS.forEach((seed, i) => {
    const routeId = `vx_demo_${seed.uf.toLowerCase()}`;
    const avatarUrl = PORTRAIT(seed.gender, 10 + i);
    map[routeId] = {
      routeId,
      handle: seed.handle,
      name: seed.displayName,
      avatar: avatarUrl,
      avatarUrl,
      uf: seed.uf,
      stateName: seed.stateName,
      stereotypeTitle: seed.stereotypeTitle,
      bio: seed.tagline,
      pixKey: pixFor(seed),
      pinnedPostId: `demo-post-${seed.uf.toLowerCase()}`,
      readme: readmeFor(seed),
      isStereotypeDemo: true,
      stats: {
        posts: 1,
        peersConnected: 2 + (i % 4),
        communities: 1,
        followers: 12 + (i * 3) % 40,
        stars: 8 + (i * 2) % 30,
        isTourDemo: true,
        isStereotypeDemo: true,
      },
    };
  });
  return map;
}

export function buildUfDemoTopics(now = Date.now()) {
  return UF_STEREOTYPE_SEEDS.map((seed, i) => {
    const uf = seed.uf.toLowerCase();
    const routeId = `vx_demo_${uf}`;
    const media = postMediaByUf[uf] || postMediaByUf.ac;
    return {
      id: `demo-post-${uf}`,
      communityId: "demo-aprenda-vox",
      title: `${seed.displayName} (${seed.uf}): nossa voz sem algoritmo estrangeiro`,
      body:
        `${seed.vibe} Aqui no Vox a conversa fica na comunidade — sem impulsionar post. ` +
        `Perfil **estereótipo demo** para testar a plataforma. #${seed.hashtag} #perfildemo #brasil`,
      image: media.postImageUrl,
      imageAlt: media.postAlt,
      author: routeId,
      owner: routeId,
      externalPain: "Redes centralizadas — alcance pago e extração de dados",
      voxResolution: "now",
      likesCount: 20 + (i * 7) % 55,
      repliesCount: i % 5 === 0 ? 1 : 0,
      isLocalP2p: true,
      ts: now - (i + 1) * 45 * 60 * 1000,
    };
  });
}

export function buildUfDemoListings(now = Date.now()) {
  return UF_STEREOTYPE_SEEDS.filter((s) => s.feira).map((seed, i) => {
    const uf = seed.uf.toLowerCase();
    const routeId = `vx_demo_${uf}`;
    const f = seed.feira;
    return {
      id: `demo-listing-${uf}`,
      type: "listing",
      communityId: "demo-feira-local",
      title: f.title,
      priceLabel: f.price,
      locationLabel: f.place,
      body: f.body,
      image: PORTRAIT(seed.gender, 50 + i),
      imageAlt: `Oferta demo — ${seed.stateName}`,
      author: routeId,
      owner: routeId,
      contactPix: pixFor(seed),
      listingStatus: "available",
      likesCount: 10 + i * 4,
      repliesCount: 0,
      isLocalP2p: true,
      ts: now - (i + 1) * 20 * 60 * 1000,
    };
  });
}

export function buildUfDemoReplies() {
  return [
    {
      id: "demo-reply-sp-mg",
      replyTo: "demo-post-mg",
      communityId: "demo-aprenda-vox",
      body: "Uai, Maria! Aqui no Vox a gente organiza sem pedir licença pro algoritmo. 🇧🇷",
      author: "vx_demo_sp",
      owner: "vx_demo_sp",
      isLocalP2p: true,
    },
    {
      id: "demo-reply-ba-am",
      replyTo: "demo-post-am",
      communityId: "demo-aprenda-vox",
      body: "Fechado! Memória nossa não vira treino de IA sem consentimento. 🌿",
      author: "vx_demo_ba",
      owner: "vx_demo_ba",
      isLocalP2p: true,
    },
    {
      id: "demo-reply-rj-ce",
      replyTo: "demo-post-ce",
      communityId: "demo-aprenda-vox",
      body: "Piada boa, Francisco — mas governança transparente é coisa séria. 😄⚖️",
      author: "vx_demo_rj",
      owner: "vx_demo_rj",
      isLocalP2p: true,
    },
  ];
}
