import 'bootstrap-icons/font/bootstrap-icons.css';
import { supabase } from "../lib/supabase";
import { onAuthRedirect, redirectIfLoggedIn } from '../lib/auth';
// import { initMap } from './map';

const loginForm = document.getElementById("login-form")!;

// async function checkSession() {
//   const { data } = await supabase.auth.getSession();

//   if (data.session) {
//     window.location.href = "/map.html";
//   }
// }

// supabase.auth.onAuthStateChange((event, session) => {
//   if (event === "SIGNED_IN" && session) {
//     window.location.href = "/map.html";
//   }
// });

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
  // } else {
  //   // alert("Login successful!");
  //   window.location.href = "/map.html";

    // showApp();
    // selectCountry("DE"); // Temporary: Automatically select Germany on login
    // initMap();
  }
});

// initMap();
// checkSession();
redirectIfLoggedIn();
onAuthRedirect();
