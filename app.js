import { getSession, signIn, signOut, getMonProfil } from './client.js';
import { chargerPlanComplet } from './data.js';
import { avancementPriorite, avancementAxe, avancementGlobal, fmtPct } from './calc.js';
import { renderRadar, renderGauges } from './radar.js';
import { escapeHtml } from './utils.js';

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
// Le repo est public : un fetch() anonyme vers raw.githubusercontent.com
// fonctionne. Pas de copie figée codée en dur, la source de vérité reste
// le fichier du repo.
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

  await chargerVueEnsemble();
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
// Vue d'ensemble : bandeau vision/mission/ambition, radar + jauges, bascule
// priorité/axe, tri par numéro ou par avancement.
// ----------------------------------------------------------------------------
let planTree = null;
let overviewMode = 'priorite'; // 'priorite' | 'axe'
let overviewSort = 'numero';   // 'numero' | 'asc' | 'desc'

async function chargerVueEnsemble() {
  const slot = document.getElementById('vue-ensemble');
  slot.innerHTML = '<p>Chargement des données du plan...</p>';

  try {
    planTree = await chargerPlanComplet();
  } catch (e) {
    slot.innerHTML = `<p style="color:#7C1D1F">Erreur de chargement : ${escapeHtml(e.message || String(e))}</p>`;
    console.error(e);
    return;
  }

  renderVueEnsemble();
}

function renderVueEnsemble() {
  const slot = document.getElementById('vue-ensemble');
  const m = planTree.planMeta || {};

  slot.innerHTML = `
    <div class="overview-header">
      <div>
        <h2>Vue d'ensemble du plan</h2>
        <div class="subtitle">Avancement global : <strong>${fmtPct(avancementGlobal(planTree.orientations))}</strong></div>
      </div>
      <div class="segment-control">
        <button class="${overviewMode === 'priorite' ? 'active' : ''}" data-mode="priorite">Par priorité (24)</button>
        <button class="${overviewMode === 'axe' ? 'active' : ''}" data-mode="axe">Par axe (8)</button>
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
  if (overviewMode === 'priorite') {
    items = planTree.prioritesPlats.map(pa => {
      const av = avancementPriorite(pa);
      return { label: '#' + pa.numero, code: pa.id, title: pa.intitule, value: av.value, override: av.override };
    });
  } else {
    items = planTree.axesPlats.map(ax => {
      const av = avancementAxe(ax);
      return { label: ax.id.replace('-', ' '), code: ax.id, title: (ax._orientation ? ax._orientation.intitule + ' · ' : '') + ax.intitule, value: av.value, override: av.override };
    });
  }

  renderRadar('radar-slot', items, overviewMode === 'priorite' ? 'Radar par priorité' : 'Radar par axe');

  const sorted = items.slice();
  if (overviewSort === 'asc') sorted.sort((a, b) => (a.value === null ? 999 : a.value) - (b.value === null ? 999 : b.value));
  else if (overviewSort === 'desc') sorted.sort((a, b) => (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value));
  renderGauges('gauge-slot', sorted);
}

// ----------------------------------------------------------------------------

render();
chargerVersion();
