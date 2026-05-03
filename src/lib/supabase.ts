import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function getRole() {
  const user = await getUser();
  return user?.app_metadata?.role ?? "user";
}

export async function requireAuth(redirectTo = "/index.html") {
  const { data } = await supabase.auth.getSession();
  // console.log("data aus requireAuth: "+data.session?.access_token);
  if (!data.session) {
    window.location.href = redirectTo;
    return null;
  }

  return data.session;
}

export async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    window.location.href = "/map.html";
  }
}

export function onAuthRedirect() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      window.location.href = "/map.html";
    }

    if (event === "SIGNED_OUT") {
      window.location.href = "/index.html";
    }
  });
}