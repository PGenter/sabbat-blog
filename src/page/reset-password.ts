import { supabase } from "../lib/supabase";

const form = document.getElementById("new-password-form") as HTMLFormElement;
const messageDiv = document.getElementById("message")!;

const passwordInput = document.getElementById("password") as HTMLInputElement;
const confirmInput = document.getElementById("confirm-password") as HTMLInputElement;

// Regeln
const rules = {
  length: document.getElementById("rule-length")!,
  letter: document.getElementById("rule-letter")!,
  number: document.getElementById("rule-number")!,
  special: document.getElementById("rule-special")!,
  match: document.getElementById("rule-match")!,
};

// Token holen
const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
const accessToken = params.get("access_token");

let isValid = false;

// 🔍 Validierungsfunktion
function validatePassword() {
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  const checks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
    match: password === confirm && password.length > 0,
  };

  // UI updaten
  Object.entries(checks).forEach(([key, value]) => {
    const el = rules[key as keyof typeof rules];
    el.classList.toggle("valid", value);
    el.classList.toggle("invalid", !value);
  });

  // Gesamtstatus
  isValid = Object.values(checks).every(Boolean);
}

// Live prüfen beim Tippen
passwordInput.addEventListener("input", validatePassword);
confirmInput.addEventListener("input", validatePassword);

// ❗ Token prüfen
if (!accessToken) {
  messageDiv.textContent = "Ungültiger oder abgelaufener Link!";
  messageDiv.style.color = "red";
  form.style.display = "none";
} else {
  supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: accessToken
  }).then(() => {

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isValid) {
        messageDiv.textContent = "Bitte erfülle alle Passwort-Anforderungen.";
        messageDiv.style.color = "red";
        return;
      }

      const password = passwordInput.value;

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        messageDiv.textContent = "Fehler: " + error.message;
        messageDiv.style.color = "red";
      } else {
        messageDiv.textContent = "Passwort erfolgreich gesetzt! Weiterleitung...";
        messageDiv.style.color = "green";

        setTimeout(() => {
          window.location.href = "/index.html";
        }, 1500);
      }
    });

  }).catch((err) => {
    messageDiv.textContent = "Fehler beim Setzen der Session: " + err.message;
    messageDiv.style.color = "red";
    form.style.display = "none";
  });
}