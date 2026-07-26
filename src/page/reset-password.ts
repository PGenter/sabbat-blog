import { supabase } from "../lib/supabase";
import { t, setLanguage, getCurrentLanguage, getStoredLanguage, getLanguageFlag, getLanguageFlagSet } from "../lib/i18n.ts";

const form = document.getElementById("new-password-form") as HTMLFormElement;
const messageDiv = document.getElementById("message")!;
const languageToggleButton = document.getElementById("language-toggle") as HTMLButtonElement | null;

const passwordInput = document.getElementById("password") as HTMLInputElement;
const confirmInput = document.getElementById(
  "confirm-password",
) as HTMLInputElement;

// Regeln
const rules = {
  length: document.getElementById("rule-length")!,
  letter: document.getElementById("rule-letter")!,
  number: document.getElementById("rule-number")!,
  special: document.getElementById("rule-special")!,
  match: document.getElementById("rule-match")!,
};

let isValid = false;

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
  const pwd = document.getElementById("password") as HTMLInputElement | null;
  const confirm = document.getElementById("confirm-password") as HTMLInputElement | null;
  const submitBtn = document.querySelector("#login-section button[type=submit]") as HTMLButtonElement | null;
  const ruleLength = document.getElementById("rule-length") as HTMLElement | null;
  const ruleLetter = document.getElementById("rule-letter") as HTMLElement | null;
  const ruleNumber = document.getElementById("rule-number") as HTMLElement | null;
  const ruleSpecial = document.getElementById("rule-special") as HTMLElement | null;
  const ruleMatch = document.getElementById("rule-match") as HTMLElement | null;

  if (heading) heading.textContent = t("resetPasswordTitle");
  if (pwd) pwd.placeholder = t("newPasswordPlaceholder");
  if (confirm) confirm.placeholder = t("confirmPasswordPlaceholder");
  if (submitBtn) submitBtn.textContent = t("resetPasswordTitle");
  if (ruleLength) ruleLength.textContent = t("passwordRuleLength");
  if (ruleLetter) ruleLetter.textContent = t("passwordRuleLetter");
  if (ruleNumber) ruleNumber.textContent = t("passwordRuleNumber");
  if (ruleSpecial) ruleSpecial.textContent = t("passwordRuleSpecial");
  if (ruleMatch) ruleMatch.textContent = t("passwordRuleMatch");
}

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

if (languageToggleButton) {
  languageToggleButton.addEventListener("click", () => {
    const current = getCurrentLanguage();
    const next = current === "german" ? "spanish" : "german";
    setLanguage(next);
    updateLanguageToggleIcon(next);
    applyTranslations();
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!isValid) {
    messageDiv.textContent = t("passwordRequirementsNotMet");
    messageDiv.style.color = "red";
    return;
  }

  const password = passwordInput.value;

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    messageDiv.textContent = t("errorSaving") + error.message;
    messageDiv.style.color = "red";
  } else {
    messageDiv.textContent = t("passwordSetSuccess");
    messageDiv.style.color = "green";

    setTimeout(() => {
      window.location.href = "/index.html";
    }, 1500);
  }
});

const initialLanguage = getStoredLanguage() || getCurrentLanguage();
setLanguage(initialLanguage);
updateLanguageToggleIcon(initialLanguage);
applyTranslations();
