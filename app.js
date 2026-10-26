import { getSession, signIn, signOut, getMonProfil } from './client.js';
import { chargerPlanComplet } from './data.js';
import { avancementPriorite, avancementAxe, avancementOrientation, avancementGlobal, fmtPct, classAvancement } from './calc.js';
import { renderRadar, renderGauges } from './radar.js';
import { escapeHtml } from './utils.js';
import { renderVuePriorite, irVersPriorite } from './vuePriorite.js';
import { renderVueProjets } from './vueProjets.js';
import { renderVueSynthese } from './vueSynthese.js';

const loginScreen = document.getElementById('login-screen');
const contentScreen = document.getElementById('content-screen');
const userZone = document.getElementById('user-zone');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

// ----------------------------------------------------------------------------
// Bascule affichage / masquage du mot de passe
// ----------------------------------------------------------------------------
document.getElementById('toggle-password').addEventListener('click', () => {
  const input = document.getElementById('login-password');
  const btn = document.getElementById('toggle-password');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? 'Afficher' : 'Masquer';
  btn.setAttribute('aria-label', showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
});

// ----------------------------------------------------------------------------
// Version et changelog — lus en direct depuis le CHANGELOG.md sur GitHub.
// ----------------------------------------------------------------------------
const CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/Jackmilkkaa/CPAGE-heracles/main/CHANGELOG.md';

async function chargerVersion() {
  const footerVersion = document.getElementById('footer-version');
  const panel = document.getElementById('changelog-panel');

  try {
    const res = await fetch(CHANGELOG_RAW_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const md = await res.text();

    const match = md.match(/##\s*\[([^\]]+)\]\s*-\s*([\d-]+)\s*([\s\S]*?)(?=\n##\s*\[|$)/);
    if (!match) throw new Error('Format de changelog non reconnu');

    const [, version, date, corps] = match;
    footerVersion.textContent = version;
    panel.innerHTML = `
      <strong>v${escapeHtml(version)}</strong> · ${escapeHtml(date)}
      <pre class="changelog-body">${escapeHtml(corps.trim())}</pre>
      <a href="https://github.com/Jackmilkkaa/CPAGE-heracles/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Changelog complet sur GitHub</a>
    `;
  } catch (e) {
    console.error('Erreur chargement changelog', e);
    footerVersion.textContent = '?';
    panel.innerHTML = '<p>Changelog indisponible pour le moment.</p>';
  }
}

document.getElementById('version-btn').addEventListener('click', () => {
  const panel = document.getElementById('changelog-panel');
  panel.hidden = !panel.hidden;
});

// ----------------------------------------------------------------------------
// Authentification
// ----------------------------------------------------------------------------
async function render() {
  const session = await getSession();

  if (!session) {
    loginScreen.hidden = false;
    contentScreen.hidden = true;
    userZone.innerHTML = '';
    return;
  }

  loginScreen.hidden = true;
  contentScreen.hidden = false;

  const profil = await getMonProfil();
  userZone.innerHTML = `
    <span>${escapeHtml(profil ? profil.email + ' · ' + profil.role : session.user.email)}</span>
    <button id="logout-btn">Déconnexion</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    render();
  });

  await chargerPlanEtAfficher();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const { error } = await signIn(email, password);
  if (error) {
    loginError.textContent = 'Connexion refusée : ' + error.message;
    loginError.hidden = false;
    return;
  }
  render();
});

// ----------------------------------------------------------------------------
// Navigation entre vues + chargement des données
// ----------------------------------------------------------------------------
let currentView = 'overview'; // 'overview' | 'priorite' | 'projets' | 'synthese'
let planTree = null;

document.querySelector('.view-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  currentView = btn.dataset.view;
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.toggle('active', b === btn));
  renderCurrentView();
});

// Utilisée depuis n'importe quelle vue pour sauter directement au détail
// d'une priorité (radar cliquable, jauges cliquables, etc.)
function naviguerVersPriorite(prioriteId) {
  irVersPriorite(prioriteId);
  currentView = 'priorite';
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === 'priorite'));
  renderCurrentView();
}

function naviguerVersOrientation(orientationId) {
  overviewScope = orientationId;
  currentView = 'overview';
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === 'overview'));
  renderCurrentView();
}

function renderCurrentView() {
  if (!planTree) return;
  const gv = document.getElementById('global-value');
  const g = avancementGlobal(planTree.orientations);
  gv.textContent = fmtPct(g);
  gv.classList.toggle('nc', g === null);

  if (currentView === 'overview') renderVueEnsemble();
  else if (currentView === 'priorite') renderVuePriorite(planTree, rafraichirDonnees);
  else if (currentView === 'projets') renderVueProjets(planTree, rafraichirDonnees);
  else if (currentView === 'synthese') renderVueSynthese(planTree, rafraichirDonnees, naviguerVersPriorite);
}

async function chargerPlanEtAfficher() {
  const slot = document.getElementById('view-slot');
  slot.innerHTML = '<p>Chargement des données du plan...</p>';

  try {
    planTree = await chargerPlanComplet();
  } catch (e) {
    slot.innerHTML = `<p style="color:#7C1D1F">Erreur de chargement : ${escapeHtml(e.message || String(e))}</p>`;
    console.error(e);
    return;
  }

  renderCurrentView();
}

// Rappelée après chaque écriture (KR, projet, impact, override...) : recharge
// tout depuis Supabase, puis ré-affiche la vue courante avec les données à
// jour. Plus simple et plus sûr qu'une mise à jour locale fine de l'arbre en
// mémoire, au prix d'un aller-retour réseau par modification.
async function rafraichirDonnees() {
  planTree = await chargerPlanComplet();
  renderCurrentView();
}

// ----------------------------------------------------------------------------
// Vue d'ensemble : bandeau vision/mission/ambition, radar + jauges, bascule
// priorité/axe, tri par numéro ou par avancement.
// ----------------------------------------------------------------------------
let overviewMode = 'axe'; // 'axe' | 'priorite'
let overviewSort = 'numero';   // 'numero' | 'asc' | 'desc'
// null = vue globale (les 4 orientations confondues) ; sinon id d'une
// orientation sur laquelle la vue d'ensemble est recadrée. Remplace l'ancien
// onglet "Par orientation" : ce n'est plus une vue à part, mais un filtre de
// périmètre appliqué au même radar et aux mêmes jauges.
let overviewScope = null;

function renderVueEnsemble() {
  const slot = document.getElementById('view-slot');
  const m = planTree.planMeta || {};
  const orient = overviewScope ? planTree.orientations.find(o => o.id === overviewScope) : null;
  // Filet de sécurité : si le scope pointe vers une orientation qui n'existe
  // plus dans les données rechargées, on retombe sur la vue globale plutôt
  // que d'afficher un écran vide.
  if (overviewScope && !orient) overviewScope = null;

  const tileBar = (v) => `<div class="tile-bar"><span class="${classAvancement(v)}" style="width:${v === null || v === undefined ? 0 : Math.max(0, Math.min(100, v))}%"></span></div>`;
  const globalValue = avancementGlobal(planTree.orientations);
  const scopeTiles = [
    `<button class="orient-tile ${!overviewScope ? 'active' : ''}" data-orient="">
      <div class="tile-top"><span class="code">Global</span><span class="val ${globalValue === null ? 'nc' : ''}">${fmtPct(globalValue)}</span></div>
      <div class="title">Toutes orientations</div>
      ${tileBar(globalValue)}
    </button>`,
    ...planTree.orientations.map(o => {
      const av = avancementOrientation(o);
      return `
        <button class="orient-tile ${o.id === overviewScope ? 'active' : ''}" data-orient="${o.id}">
          <div class="tile-top"><span class="code">${escapeHtml(o.id)}</span><span class="val ${av.value === null ? 'nc' : ''}">${fmtPct(av.value)}</span></div>
          <div class="title">${escapeHtml(o.intitule)}</div>
          ${tileBar(av.value)}
        </button>
      `;
    }),
  ].join('');

  const nbAxes = orient ? orient.axes.length : planTree.axesPlats.length;
  const nbPriorites = orient
    ? orient.axes.reduce((n, ax) => n + ax.priorites.length, 0)
    : planTree.prioritesPlats.length;

  slot.innerHTML = `
    <div class="overview-header">
      <div>
        <h2>${orient ? escapeHtml(orient.id) + ' · ' + escapeHtml(orient.intitule) : "Vue d'ensemble du plan"}</h2>
        <div class="subtitle">${orient ? `${orient.axes.length} axes · ${nbPriorites} priorités d'action` : `${planTree.orientations.length} orientations · ${planTree.axesPlats.length} axes · ${planTree.prioritesPlats.length} priorités d'action`}</div>
      </div>
      <div class="segment-control">
        <button class="${overviewMode === 'axe' ? 'active' : ''}" data-mode="axe">Par axe (${nbAxes})</button>
        <button class="${overviewMode === 'priorite' ? 'active' : ''}" data-mode="priorite">Par priorité (${nbPriorites})</button>
      </div>
    </div>

    <div class="orient-selector">${scopeTiles}</div>

    ${orient ? `
    <div class="vision-block">
      <p style="margin-bottom:0">${escapeHtml(orient.description || '')}</p>
    </div>` : (m.vision || m.mission || m.ambition) ? `
    <div class="vision-block">
      <div class="vision-grid">
        <div><span class="vision-label">Vision</span><p>${escapeHtml(m.vision || '')}</p></div>
        <div><span class="vision-label">Mission</span><p>${escapeHtml(m.mission || '')}</p></div>
        <div><span class="vision-label">Ambition</span><p>${escapeHtml(m.ambition || '')}</p></div>
      </div>
    </div>` : ''}

    <div class="overview-grid">
      <div class="card">
        <div class="card-title">Vue d'ensemble</div>
        <div class="radar-container" id="radar-slot"></div>
      </div>
      <div class="card">
        <div class="card-title">${overviewMode === 'priorite' ? 'Par priorités d\u2019action' : 'Par axes'}</div>
        <div class="gauge-sort-header">
          <button class="sort-icon-btn ${overviewSort === 'numero' ? 'active' : ''}" data-sort="numero">#</button>
          <button class="sort-icon-btn ${overviewSort !== 'numero' ? 'active' : ''}" data-sort="toggle-value">
            % <span class="sort-icon-arrow">${overviewSort === 'asc' ? '↑' : (overviewSort === 'desc' ? '↓' : '↕')}</span>
          </button>
        </div>
        <div class="gauge-list" id="gauge-slot"></div>
      </div>
    </div>
  `;

  slot.querySelectorAll('.orient-tile').forEach(btn => {
    btn.addEventListener('click', () => { overviewScope = btn.dataset.orient || null; renderVueEnsemble(); });
  });
  slot.querySelectorAll('.segment-control button').forEach(btn => {
    btn.addEventListener('click', () => { overviewMode = btn.dataset.mode; renderVueEnsemble(); });
  });
  slot.querySelector('[data-sort="numero"]').addEventListener('click', () => { overviewSort = 'numero'; renderVueEnsemble(); });
  slot.querySelector('[data-sort="toggle-value"]').addEventListener('click', () => {
    overviewSort = overviewSort === 'desc' ? 'asc' : 'desc';
    renderVueEnsemble();
  });

  dessinerRadarEtJauges(orient);
}

function dessinerRadarEtJauges(orient) {
  let items;
  let quadrantLabels = null;
  if (overviewMode === 'priorite') {
    const priorites = orient
      ? orient.axes.flatMap(ax => ax.priorites)
      : planTree.prioritesPlats;
    items = priorites.map(pa => {
      const av = avancementPriorite(pa);
      return { label: '#' + pa.numero, code: pa.id, title: pa.intitule, value: av.value, override: av.override, onClick: () => naviguerVersPriorite(pa.id) };
    });
    items.sort((a, b) => parseInt(a.label.slice(1)) - parseInt(b.label.slice(1)));
  } else {
    const axes = orient
      ? planTree.axesPlats.filter(ax => ax._orientation && ax._orientation.id === orient.id)
      : planTree.axesPlats;
    items = axes.map(ax => {
      const av = avancementAxe(ax);
      return {
        label: ax.id.replace('-', ' '), code: ax.id,
        title: (ax._orientation ? ax._orientation.intitule + ' · ' : '') + ax.intitule,
        value: av.value, override: av.override,
        onClick: (!orient && ax._orientation) ? () => naviguerVersOrientation(ax._orientation.id) : null,
      };
    });
    if (!orient) {
      // Chaque orientation possède 2 axes consécutifs : avec 8 axes répartis
      // régulièrement, le premier axe de chaque orientation tombe exactement
      // au nord, à l'est, au sud et à l'ouest. On affiche son intitulé à cette
      // position, en surimpression légère, pour lire d'un coup d'œil sur
      // quelle orientation le plan progresse le plus sans changer de vue.
      quadrantLabels = planTree.orientations.map((o, i) => ({ atIndex: i * 2, label: o.intitule }));
    }
  }

  renderRadar('radar-slot', items, overviewMode === 'priorite' ? 'Radar par priorité' : 'Radar par axe', quadrantLabels);

  const sorted = items.slice();
  if (overviewSort === 'asc') sorted.sort((a, b) => (a.value === null ? 999 : a.value) - (b.value === null ? 999 : b.value));
  else if (overviewSort === 'desc') sorted.sort((a, b) => (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value));
  renderGauges('gauge-slot', sorted);
}

// ----------------------------------------------------------------------------

render();
chargerVersion();
