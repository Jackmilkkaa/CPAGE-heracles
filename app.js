import { supabase, getSession, signIn, signOut, getMonProfil } from './client.js';

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
// Le repo est désormais public : un fetch() anonyme vers
// raw.githubusercontent.com fonctionne. Pas de copie figée codée en dur,
// la source de vérité reste le fichier du repo.
// ----------------------------------------------------------------------------
const CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/Jackmilkkaa/CPAGE-heracles/main/CHANGELOG.md';

async function chargerVersion() {
  const footerVersion = document.getElementById('footer-version');
  const panel = document.getElementById('changelog-panel');

  try {
    const res = await fetch(CHANGELOG_RAW_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const md = await res.text();

    // Première entrée de version : "## [x.y.z] - AAAA-MM-JJ" jusqu'à la suivante
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('version-btn').addEventListener('click', () => {
  const panel = document.getElementById('changelog-panel');
  panel.hidden = !panel.hidden;
});

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
    <span>${profil ? profil.email + ' · ' + profil.role : session.user.email}</span>
    <button id="logout-btn">Déconnexion</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    render();
  });

  await chargerApercuOrientations();
}

// Première requête de lecture, juste pour valider que la connexion et les RLS
// fonctionnent de bout en bout. À remplacer par les vraies vues au fil des
// prochaines features.
async function chargerApercuOrientations() {
  const slot = document.getElementById('orientations-preview');
  const { data, error } = await supabase
    .from('orientations')
    .select('id, intitule')
    .order('id');

  if (error) {
    slot.innerHTML = `<p style="color:#7C1D1F">Erreur de lecture : ${error.message}</p>`;
    return;
  }

  slot.innerHTML = '<ul>' + data.map(o => `<li>${o.id} · ${o.intitule}</li>`).join('') + '</ul>';
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

render();
chargerVersion();
