import "bootstrap-icons/font/bootstrap-icons.css";
import { supabase,  redirectIfLoggedIn} from "../lib/supabase";

redirectIfLoggedIn();

const form = document.getElementById("reset-form") as HTMLFormElement;
const closeButton = document.getElementById("close-button") as HTMLButtonElement;
const messageDiv = document.getElementById("message")!;

closeButton.addEventListener("click", () => {
  window.location.href = "/index.html";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (document.getElementById("email") as HTMLInputElement).value;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html"
  });

  if (error) {
    messageDiv.textContent = "Fehler: " + error.message;
    messageDiv.style.color = "red";
  } else {
    messageDiv.textContent = "Reset-Link wurde gesendet! Bitte prüfe deine Email.";
  }
});