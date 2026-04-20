import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// let lastActivity = Date.now()

// window.addEventListener('mousemove', () => lastActivity = Date.now())
// window.addEventListener('keydown', () => lastActivity = Date.now())

// setInterval(() => {
//   if (Date.now() - lastActivity > 15 * 60 * 1000) {
//     supabase.auth.signOut()
//   }
// }, 60_000)