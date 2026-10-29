/** @file Modal de boas-vindas (pacto): mosaico de fotos reais, prova social e 3 pilares. */

const IMG = "images/welcome";

const MOSAIC = Object.freeze([
  { src: "riso-celular", alt: "Mulher sorrindo ao celular" },
  { src: "roda-amigos", alt: "Amigos abraçados olhando o horizonte" },
  { src: "brinde-mesa", alt: "Turma brindando em volta da mesa" },
  { src: "artista-rua", alt: "Artista sorrindo diante de um mural" },
  { src: "turma-notebook", alt: "Colegas rindo juntos diante do notebook" },
  { src: "maos-juntas", alt: "Grupo unindo as mãos no centro da roda" },
]);

const AVATARS = Object.freeze(["mei", "yara", "andre", "fernanda", "pri", "kaue"]);

const PILLARS = Object.freeze([
  { icon: "🛡️", title: "Seus dados são seus", desc: "Suas mensagens e publicações pertencem a você. Nenhuma empresa controla sua conta." },
  { icon: "🤝", title: "Rede cooperativa", desc: "Cada aparelho ajuda a levar os posts adiante — sem servidores caros nem dono." },
  { icon: "🎛️", title: "Controle total", desc: "Respeita Wi-Fi e teto diário de dados. Pause quando quiser." },
]);

function renderMosaic() {
  const tiles = MOSAIC.map(
    (m, i) =>
      `<img class="welcome-tile welcome-tile--${i + 1}" src="${IMG}/${m.src}.jpg" alt="${m.alt}" loading="eager" decoding="async" width="360" height="360">`,
  ).join("");
  return `
    <div class="welcome-hero">
      <div class="welcome-mosaic">${tiles}</div>
      <div class="welcome-hero-fade" aria-hidden="true"></div>
      <div class="welcome-hero-copy">
        <span class="welcome-kicker">Vox · rede social sem dono</span>
        <h2 id="pact-welcome-title" class="welcome-title">Bem-vindo ao Vox</h2>
        <p class="welcome-sub">Sua turma, sua família e seu bairro conversando direto de aparelho pra aparelho.</p>
      </div>
    </div>`;
}

function renderAvatarStack() {
  const faces = AVATARS.map(
    (a) => `<img src="${IMG}/av-${a}.jpg" alt="" width="36" height="36" loading="eager" decoding="async">`,
  ).join("");
  return `
    <div class="welcome-social">
      <div class="welcome-avatars" aria-hidden="true">${faces}</div>
      <p class="welcome-social-text">Chame quem você gosta: <strong>amigos, família e vizinhos</strong> no mesmo lugar.</p>
    </div>`;
}

function renderPillar(p) {
  return `
    <li class="modal-feature welcome-pillar">
      <span class="modal-feature-icon welcome-pillar-icon" aria-hidden="true">${p.icon}</span>
      <div>
        <strong>${p.title}</strong>
        <p class="desc modal-feature-desc">${p.desc}</p>
      </div>
    </li>`;
}

export function renderPactModalHtml() {
  return `
    <div class="modal-overlay modal-sheet" id="pact-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pact-welcome-title">
      <div class="modal-dialog modal-card welcome-card">
        ${renderMosaic()}
        <div class="welcome-body">
          ${renderAvatarStack()}
          <ul class="welcome-pillars">${PILLARS.map(renderPillar).join("")}</ul>
          <div class="modal-actions modal-actions--stack">
            <button id="btn-pact-accept" class="btn btn-primary btn-pact-continue">Entrar na roda</button>
            <button id="btn-pact-settings" class="btn btn-outline btn-pact-settings">Ajustar rede depois</button>
          </div>
        </div>
      </div>
    </div>`;
}
