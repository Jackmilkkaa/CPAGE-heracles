import { supabase, getSession, signIn, signOut, getMonProfil } from './client.js';

const loginScreen = document.getElementById('login-screen');
const contentScreen = document.getElementById('content-screen');
const userZone = document.getElementById('user-zone');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

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
