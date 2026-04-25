import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
const { data } = await supabase.auth.getSession();

export const user = data.session?.user;
export const role = user?.app_metadata?.role || "user";

export async function requireAuth(redirectTo = "/index.html") {
  // const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = redirectTo;
    return null;
  }

  return data.session;
}

export async function redirectIfLoggedIn() {
  // const { data } = await supabase.auth.getSession();

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

// let lastActivity = Date.now()

// window.addEventListener('mousemove', () => lastActivity = Date.now())
// window.addEventListener('keydown', () => lastActivity = Date.now())

// setInterval(() => {
//   if (Date.now() - lastActivity > 15 * 60 * 1000) {
//     supabase.auth.signOut()
//   }
// }, 60_000)