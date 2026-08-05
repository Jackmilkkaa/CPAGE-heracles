// ============================================================================
// Client Supabase — Héraclès Pilotage
// ============================================================================
// URL et clé publishable du projet "CPAGE-Pro". Cette clé est faite pour être
// publique côté navigateur (§4.1 du cadre SDF Lab : ce n'est pas un secret,
// la vraie protection ce sont les RLS définies dans
// supabase/migrations/0001_init_schema.sql). Rien d'anormal à la voir ici en
// clair dans le code — c'est l'usage prévu par Supabase pour cette clé.
// ============================================================================

const SUPABASE_URL = 'https://xgiygqqlwubschwluczv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__n8DWQ8dZQoMpHy5DN9BKg_jC0l5D2g';

// IMPORTANT : Héraclès vit dans le schéma "heracles", pas "public".
// Ce schéma doit être ajouté dans Project Settings > API > Exposed schemas
// sur le projet Supabase, sinon l'API renverra une erreur "schema not exposed".
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'heracles' }
});

// ----------------------------------------------------------------------------
// Helpers d'authentification
// ----------------------------------------------------------------------------

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// Récupère le profil (et donc le rôle) de l'utilisateur connecté
export async function getMonProfil() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profils')
    .select('id, email, nom, role')
    .eq('id', session.user.id)
    .single();
  if (error) {
    console.error('Erreur récupération profil', error);
    return null;
  }
  return data;
}
