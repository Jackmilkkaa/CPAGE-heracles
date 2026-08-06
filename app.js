import { getSession, signIn, signOut, getMonProfil } from './client.js';
import { chargerPlanComplet } from './data.js';
import { avancementPriorite, avancementAxe, avancementOrientation, avancementGlobal, fmtPct } from './calc.js';
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
let currentView = 'overview'; // 'overview' | 'orientation' | 'priorite' | 'projets' | 'synthese'
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
  currentOrientationId = orientationId;
  currentView = 'orientation';
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.toggle('active', b.dataset.view === 'orientation'));
  renderCurrentView();
}

function renderCurrentView() {
  if (!planTree) return;
  const gv = document.getElementById('global-value');
  const g = avancementGlobal(planTree.orientations);
  gv.textContent = fmtPct(g);
  gv.classList.toggle('nc', g === null);

  if (currentView === 'overview') renderVueEnsemble();
  else if (currentView === 'orientation') renderVueOrientation();
  else if (currentView === 'priorite') renderVuePriorite(planTree, rafraichirDonnees);
  else if (currentView === 'projets') renderVueProjets(planTree, rafraichirDonnees);
  else if (currentView === 'synthese') renderVueSynthese(planTree);
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

function renderVueEnsemble() {
  const slot = document.getElementById('view-slot');
  const m = planTree.planMeta || {};

  slot.innerHTML = `
    <div class="overview-header">
      <div>
        <h2>Vue d'ensemble du plan</h2>
        <div class="subtitle">Avancement global : <strong>${fmtPct(avancementGlobal(planTree.orientations))}</strong></div>
      </div>
      <div class="segment-control">
        <button class="${overviewMode === 'axe' ? 'active' : ''}" data-mode="axe">Par axe (8)</button>
        <button class="${overviewMode === 'priorite' ? 'active' : ''}" data-mode="priorite">Par priorité (24)</button>
      </div>
    </div>

    ${(m.vision || m.mission || m.ambition) ? `
    <div class="vision-block">
      <h3>Vision · Mission · Ambition</h3>
      <div class="vision-grid">
        <p>${escapeHtml(m.vision || '')}</p>
        <p>${escapeHtml(m.mission || '')}</p>
        <p>${escapeHtml(m.ambition || '')}</p>
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

  slot.querySelectorAll('.segment-control button').forEach(btn => {
    btn.addEventListener('click', () => { overviewMode = btn.dataset.mode; renderVueEnsemble(); });
  });
  slot.querySelector('[data-sort="numero"]').addEventListener('click', () => { overviewSort = 'numero'; renderVueEnsemble(); });
  slot.querySelector('[data-sort="toggle-value"]').addEventListener('click', () => {
    overviewSort = overviewSort === 'desc' ? 'asc' : 'desc';
    renderVueEnsemble();
  });

  dessinerRadarEtJauges();
}

function dessinerRadarEtJauges() {
  let items;
  let quadrantLabels = null;
  if (overviewMode === 'priorite') {
    items = planTree.prioritesPlats.map(pa => {
      const av = avancementPriorite(pa);
      return { label: '#' + pa.numero, code: pa.id, title: pa.intitule, value: av.value, override: av.override, onClick: () => naviguerVersPriorite(pa.id) };
    });
  } else {
    items = planTree.axesPlats.map(ax => {
      const av = avancementAxe(ax);
      return {
        label: ax.id.replace('-', ' '), code: ax.id,
        title: (ax._orientation ? ax._orientation.intitule + ' · ' : '') + ax.intitule,
        value: av.value, override: av.override,
        onClick: ax._orientation ? () => naviguerVersOrientation(ax._orientation.id) : null,
      };
    });
    // Chaque orientation possède 2 axes consécutifs : avec 8 axes répartis
    // régulièrement, le premier axe de chaque orientation tombe exactement
    // au nord, à l'est, au sud et à l'ouest. On affiche son intitulé à cette
    // position, en surimpression légère, pour lire d'un coup d'œil sur
    // quelle orientation le plan progresse le plus sans changer de vue.
    quadrantLabels = planTree.orientations.map((o, i) => ({ atIndex: i * 2, label: o.intitule }));
  }

  renderRadar('radar-slot', items, overviewMode === 'priorite' ? 'Radar par priorité' : 'Radar par axe', quadrantLabels);

  const sorted = items.slice();
  if (overviewSort === 'asc') sorted.sort((a, b) => (a.value === null ? 999 : a.value) - (b.value === null ? 999 : b.value));
  else if (overviewSort === 'desc') sorted.sort((a, b) => (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value));
  renderGauges('gauge-slot', sorted);
}

// ----------------------------------------------------------------------------
// Vue par orientation : sélecteur à 4 tuiles, description, jauges des axes
// et des priorités de l'orientation sélectionnée.
// ----------------------------------------------------------------------------
let currentOrientationId = null;

function renderVueOrientation() {
  const slot = document.getElementById('view-slot');

  if (!currentOrientationId || !planTree.orientations.some(o => o.id === currentOrientationId)) {
    currentOrientationId = planTree.orientations[0] ? planTree.orientations[0].id : null;
  }
  const orient = planTree.orientations.find(o => o.id === currentOrientationId);
  if (!orient) { slot.innerHTML = '<p>Aucune orientation disponible.</p>'; return; }

  const tiles = planTree.orientations.map(o => {
    const av = avancementOrientation(o);
    return `
      <button class="orient-tile ${o.id === currentOrientationId ? 'active' : ''}" data-orient="${o.id}">
        <div class="code">${escapeHtml(o.id)}</div>
        <div class="title">${escapeHtml(o.intitule)}</div>
        <div class="val ${av.value === null ? 'nc' : ''}">${fmtPct(av.value)}</div>
      </button>
    `;
  }).join('');

  const axeItems = orient.axes.map(ax => {
    const av = avancementAxe(ax);
    return { label: ax.id, code: ax.id, title: ax.intitule, value: av.value, override: av.override };
  });

  const paItems = [];
  for (const ax of orient.axes) {
    for (const pa of ax.priorites) {
      const av = avancementPriorite(pa);
      paItems.push({ label: '#' + pa.numero, code: pa.id, title: pa.intitule, value: av.value, override: av.override, onClick: () => naviguerVersPriorite(pa.id) });
    }
  }
  paItems.sort((a, b) => parseInt(a.label.slice(1)) - parseInt(b.label.slice(1)));

  slot.innerHTML = `
    <div class="orient-selector">${tiles}</div>

    <div class="vision-block">
      <h3>${escapeHtml(orient.id)} · ${escapeHtml(orient.intitule)}</h3>
      <p style="margin-bottom:0">${escapeHtml(orient.description || '')}</p>
    </div>

    <div class="overview-grid">
      <div class="card">
        <div class="card-title">Axes de l'orientation</div>
        <div class="gauge-list" id="axe-slot"></div>
      </div>
      <div class="card">
        <div class="card-title">Priorités de l'orientation</div>
        <div class="gauge-list" id="prio-slot"></div>
      </div>
    </div>
  `;

  slot.querySelectorAll('.orient-tile').forEach(btn => {
    btn.addEventListener('click', () => { currentOrientationId = btn.dataset.orient; renderVueOrientation(); });
  });

  renderGauges('axe-slot', axeItems);
  renderGauges('prio-slot', paItems);
}

// ----------------------------------------------------------------------------

render();
chargerVersion();
