import 'bootstrap-icons/font/bootstrap-icons.css';
import { supabase, onAuthRedirect, redirectIfLoggedIn } from "../lib/supabase";

const loginForm = document.getElementById("login-form")!;

loginForm.addEventListener("submit", async (e: Event) => {
  e.preventDefault();

  const email = (document.getElementById("email") as HTMLInputElement).value;
  const password = (document.getElementById("password") as HTMLInputElement)
    .value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert(error.message);
  }
});

redirectIfLoggedIn();
onAuthRedirect();
