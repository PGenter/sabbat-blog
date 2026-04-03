import { supabase } from "./supabase";

export async function requireAuth(redirectTo = "/index.html") {
  const { data } = await supabase.auth.getSession();

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