import 'bootstrap-icons/font/bootstrap-icons.css';
import { supabase, onAuthRedirect, redirectIfLoggedIn } from "../lib/supabase";
import { t, setLanguage, getCurrentLanguage, getStoredLanguage, getLanguageFlag, getLanguageFlagSet } from "../lib/i18n.ts";

const loginForm = document.getElementById("login-form")!;
const languageToggleButton = document.getElementById("language-toggle") as HTMLButtonElement | null;

function updateLanguageToggleIcon(language: "german" | "spanish") {
  if (!languageToggleButton) return;
  const img = languageToggleButton.querySelector("img") as HTMLImageElement | null;
  if (!img) return;
  img.src = getLanguageFlag(language);
  img.srcset = `${getLanguageFlagSet(language)} 2x`;
  img.alt = language === "german" ? "Deutsch" : "Español";
  languageToggleButton.title = t("languageToggleTitle");
}

function applyTranslations() {
  const heading = document.querySelector("#login-section h2") as HTMLElement | null;
  const email = document.getElementById("email") as HTMLInputElement | null;
  const password = document.getElementById("password") as HTMLInputElement | null;
  const loginBtn = document.getElementById("login") as HTMLButtonElement | null;
  const resetLink = document.querySelector(".reset-link a") as HTMLAnchorElement | null;

  if (heading) heading.textContent = t("loginTitle");
  if (email) email.placeholder = t("emailPlaceholder");
  if (password) password.placeholder = t("passwordPlaceholder") || t("newPasswordPlaceholder");
  if (loginBtn) loginBtn.innerHTML = `<i class="bi bi-box-arrow-in-right"></i> ${t("loginButton")}`;
  if (resetLink) resetLink.textContent = t("forgotPassword");
}

if (languageToggleButton) {
  languageToggleButton.addEventListener("click", () => {
    const current = getCurrentLanguage();
    const next = current === "german" ? "spanish" : "german";
    setLanguage(next);
    updateLanguageToggleIcon(next);
    applyTranslations();
  });
}

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

const isConfirmFlow = new URLSearchParams(window.location.search).has("token_hash");

if (!isConfirmFlow) {
  redirectIfLoggedIn();
  onAuthRedirect();
}

const initialLanguage = getStoredLanguage() || getCurrentLanguage();
setLanguage(initialLanguage);
updateLanguageToggleIcon(initialLanguage);
applyTranslations();
