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
// Version et changelog — lus depuis Supabase, pas depuis GitHub.
// Le repo est privé (§4.2 du cadre SDF Lab) : un fetch() anonyme vers
// raw.githubusercontent.com échouerait. La table heracles.app_version est
// mise à jour par l'assistant à chaque release poussée sur GitHub.
// ----------------------------------------------------------------------------
async function chargerVersion() {
  const { data, error } = await supabase
    .from('app_version')
    .select('version, date_release, changelog_extrait, changelog_url')
    .single();

  const footerVersion = document.getElementById('footer-version');
  if (error || !data) {
    footerVersion.textContent = '?';
    return;
  }
  footerVersion.textContent = data.version;

  const panel = document.getElementById('changelog-panel');
  panel.innerHTML = `
    <strong>v${data.version}</strong> · ${data.date_release}<br>
    ${data.changelog_extrait || ''}<br>
    <a href="${data.changelog_url}" target="_blank" rel="noopener">Changelog complet sur GitHub</a>
  `;
}

document.getElementById('version-btn').addEventListener('click', () => {
  const panel = document.getElementById('changelog-panel');
  panel.hidden = !panel.hidden;
});

// ----------------------------------------------------------------------------

async function render() {
  const session = await getSession();
  chargerVersion(); // retenté à chaque render : échoue avant connexion (RLS), réussit après

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
