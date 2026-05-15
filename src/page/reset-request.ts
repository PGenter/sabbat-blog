import "bootstrap-icons/font/bootstrap-icons.css";
import { supabase, redirectIfLoggedIn } from "../lib/supabase";
import { t, setLanguage, getCurrentLanguage, getStoredLanguage, getLanguageFlag, getLanguageFlagSet } from "../lib/i18n.ts";

redirectIfLoggedIn();

const form = document.getElementById("reset-form") as HTMLFormElement;
const closeButton = document.getElementById("close-button") as HTMLButtonElement;
const messageDiv = document.getElementById("message")!;
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
  const resetBtn = document.getElementById("reset") as HTMLButtonElement | null;
  const closeBtn = document.getElementById("close-button") as HTMLButtonElement | null;

  if (heading) heading.textContent = t("resetRequestTitle");
  if (email) email.placeholder = t("emailPlaceholder");
  if (resetBtn) resetBtn.innerHTML = `<i class="bi bi-key"></i> ${t("resetRequestButton")}`;
  if (closeBtn) closeBtn.title = t("loginTitle");
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

closeButton.addEventListener("click", () => {
  window.location.href = "/index.html";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = (document.getElementById("email") as HTMLInputElement).value;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html",
  });

  if (error) {
    messageDiv.textContent = t("errorSaving") + error.message;
    messageDiv.style.color = "red";
  } else {
    messageDiv.textContent = t("resetLinkSent");
  }
});

const initialLanguage = getStoredLanguage() || getCurrentLanguage();
setLanguage(initialLanguage);
updateLanguageToggleIcon(initialLanguage);
applyTranslations();