import { hideModal } from "../page/main";
import { supabase } from "./supabase";
import { handleError } from "./errorHandler";
import { t } from "./i18n.ts";

let selectedLanguage = "german";

const { data: userData } = await supabase.auth.getUser();
const button = document.getElementById("inviteBtn") as HTMLButtonElement;
const languageButtons = document.querySelectorAll(".lang-btn");

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    languageButtons.forEach((btn) => btn.classList.remove("active"));

    button.classList.add("active");

    selectedLanguage = button.getAttribute("data-language") || "german";
  });
});

function applyInviteTranslations() {
  const inviteTitle = document.querySelector(
    "#invitation-section .card-head h2",
  ) as HTMLElement | null;
  const firstName = document.getElementById("firstName") as HTMLInputElement | null;
  const lastName = document.getElementById("lastName") as HTMLInputElement | null;
  const email = document.getElementById("email") as HTMLInputElement | null;
  const inviteBtn = document.getElementById("inviteBtn") as HTMLButtonElement | null;

  if (inviteTitle) inviteTitle.textContent = t("newUserInvite");
  if (firstName) firstName.placeholder = t("firstNamePlaceholder");
  if (lastName) lastName.placeholder = t("lastNamePlaceholder");
  if (email) email.placeholder = t("emailPlaceholder");
  if (inviteBtn) inviteBtn.innerHTML = `<i class="bi bi-person-add"></i> ${t(
    "inviteSend",
  )}`;
}

applyInviteTranslations();

button.addEventListener("click", async () => {
  try {
    const email = (document.getElementById("email") as HTMLInputElement).value;
    const firstName = (document.getElementById("firstName") as HTMLInputElement)
      .value;
    const lastName = (document.getElementById("lastName") as HTMLInputElement)
      .value;

    if (!userData.user) {
      alert(t("loginRequired"));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(
      "https://xwlywwowqbruqbyiehwe.supabase.co/functions/v1/invite-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, firstName, lastName, selectedLanguage }),
      },
    );
    if (!res.ok) {
      let errorData;

      try {
        errorData = await res.json();
      } catch {
        errorData = { message: res.statusText, status: res.status };
      }

      throw errorData;
    }

    hideModal(document.getElementById("invitation-section") as HTMLDivElement);
  } catch (error) {
    handleError(error);
  }
});
