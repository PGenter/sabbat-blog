import "bootstrap-icons/font/bootstrap-icons.css";
import "../lib/map.ts";
import "../lib/invite.ts";
import {
  getRole,
  supabase,
  requireAuth,
  getUserLanguage,
  updateUserLanguage,
} from "../lib/supabase.ts";
import {
  initMap,
  selectCountry,
  clearMarkers,
  map,
  toggleEditMode,
  refreshLanguage,
} from "../lib/map.ts";
import { setOnCountryChange, updateCountryLabels } from "../lib/slider";
import { startUpload } from "./upload.ts";
import {
  setLanguage,
  t,
  getLanguageFlag,
  getCurrentLanguage,
  getLanguageFlagSet,
} from "../lib/i18n.ts";

const logoutButton = document.getElementById("logout")!;
const uploadButton = document.getElementById("upload")!;
const editMapButton = document.getElementById("edit-map")!;
const editGalleryButton = document.getElementById("edit-gallery")!;
const inviteButton = document.getElementById("invite")!;
const languageToggleButton = document.getElementById(
  "language-toggle",
) as HTMLButtonElement;
const uploadCloseButton = document.getElementById(
  "upload-close-button",
) as HTMLButtonElement;
const inviteCloseButton = document.getElementById(
  "invite-close-button",
) as HTMLButtonElement;
const uploadsection = document.getElementById(
  "upload-section",
) as HTMLDivElement;
const invitesection = document.getElementById(
  "invitation-section",
) as HTMLDivElement;
const mapWrapper = document.getElementById("map") as HTMLDivElement;
const navwrapper = document.getElementById("nav-wrapper") as HTMLDivElement;
const modalBackdrop = document.getElementById("modal-backdrop") as HTMLDivElement;
const input = document.getElementById("images") as HTMLInputElement;
const fileInfo = document.getElementById("file-info") as HTMLDivElement;

init();

async function init() {
  // const { data } = await supabase.auth.getSession();

  // const user = data.session?.user;
  // const role = user?.app_metadata?.role || "user";
  const role = await getRole();

  if (role === "superuser" || role === "administrator") {
    showSuperuserButtons();
  } else {
    hideSuperuserButtons();
  }
  
  if (role === "administrator") {
    showInvitationButton();
  } else {
    hideInvitationButton();
  }
}

function showSuperuserButtons() {
  uploadButton.style.display = "block";
  editMapButton.style.display = "block";
  editGalleryButton.style.display = "block";
}

function hideSuperuserButtons() {
  if (uploadButton) {
    uploadButton.style.display = "none";
  }
  if(editGalleryButton){
    editGalleryButton.style.display = "none";
  }
  if(editMapButton){
    editMapButton.style.display = "none";
  }
}

function showInvitationButton() {
  inviteButton.style.display = "block";
}

function hideInvitationButton() {
  if(inviteButton){
    inviteButton.style.display = "none";
  }
}

function showModal(dialogType:HTMLDivElement){
  dialogType.style.visibility = "visible";
  dialogType.style.opacity = "1";
  modalBackdrop.classList.add("active");
  mapWrapper.classList.add("inactive-background");
  navwrapper.classList.add("inactive-background");
  map.scrollWheelZoom.disable();
}

export function hideModal(dialogType:HTMLDivElement) {
  dialogType.style.visibility = "hidden";
  dialogType.style.opacity = "0";
  modalBackdrop.classList.remove("active");
  mapWrapper.classList.remove("inactive-background");
  navwrapper.classList.remove("inactive-background");
  map.scrollWheelZoom.enable();
}

function updateLanguageToggleIcon(language: "german" | "spanish") {
  if (!languageToggleButton) return;
  const img = languageToggleButton.querySelector("img") as HTMLImageElement | null;
  if (!img) return;
  img.src = getLanguageFlag(language);
  img.srcset = getLanguageFlagSet(language);
  img.alt = language === "german" ? "Deutsch" : "Español";
  languageToggleButton.title = t("languageToggleTitle");
}

function applyTranslations() {
  logoutButton.title = t("logout");
  uploadButton.title = t("upload");
  editMapButton.title = t("editMap");
  editGalleryButton.title = t("editGallery");
  inviteButton.title = t("invite");
  if (languageToggleButton) {
    languageToggleButton.title = t("languageToggleTitle");
  }

  const uploadTitle = uploadsection.querySelector(".card-head h2") as HTMLElement | null;
  if (uploadTitle) uploadTitle.textContent = t("photoUpload");

  const titleEl = document.getElementById("title") as HTMLInputElement | null;
  const descriptionEl = document.getElementById("description") as HTMLTextAreaElement | null;
  const fileLabel = uploadsection.querySelector(".file-label") as HTMLElement | null;
  const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement | null;

  if (titleEl) titleEl.placeholder = t("titlePlaceholder");
  if (descriptionEl) descriptionEl.placeholder = t("descriptionPlaceholder");
  if (fileLabel) fileLabel.textContent = t("chooseImages");
  if (
    fileInfo.textContent === "Kein Bild ausgewählt" ||
    fileInfo.textContent === "Keine Datei gewählt" ||
    fileInfo.textContent === "Ninguna imagen seleccionada"
  ) {
    fileInfo.textContent = t("noFileSelected");
  }
  if (uploadBtn)
    uploadBtn.innerHTML = `<i class="bi bi-cloud-arrow-up"></i> ${t("uploadStart")}`;

  const inviteTitle = invitesection.querySelector(".card-head h2") as HTMLElement | null;
  if (inviteTitle) inviteTitle.textContent = t("newUserInvite");

  const firstName = document.getElementById("firstName") as HTMLInputElement | null;
  const lastName = document.getElementById("lastName") as HTMLInputElement | null;
  const emailInput = document.getElementById("email") as HTMLInputElement | null;
  const inviteBtn = document.getElementById("inviteBtn") as HTMLButtonElement | null;

  if (firstName) firstName.placeholder = t("firstNamePlaceholder");
  if (lastName) lastName.placeholder = t("lastNamePlaceholder");
  if (emailInput) emailInput.placeholder = t("emailPlaceholder");
  if (inviteBtn) inviteBtn.innerHTML = `<i class="bi bi-person-add"></i> ${t("inviteSend")}`;
}

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  clearMarkers();
  await requireAuth();
});

uploadButton.addEventListener("click", () => {
  showModal(uploadsection);
}); 

editMapButton.addEventListener("click", () => {
  toggleEditMode("edit-map");
});

editGalleryButton.addEventListener("click", () => {
  toggleEditMode("edit-gallery");
});

uploadCloseButton.addEventListener("click", () => {
  hideModal(uploadsection);
});

inviteButton.addEventListener("click", () => {
  showModal(invitesection);
}); 

inviteCloseButton.addEventListener("click", () => {
  hideModal(invitesection);
});

languageToggleButton.addEventListener("click", async () => {
  const currentLanguage = getCurrentLanguage();
  const newLanguage = currentLanguage === "german" ? "spanish" : "german";

  setLanguage(newLanguage);
  updateLanguageToggleIcon(newLanguage);
  applyTranslations();
  updateCountryLabels();
  await updateUserLanguage(newLanguage);
  await refreshLanguage();
});

document.body.addEventListener("keydown", (event) => {
    const key = event.key;
    switch (key) {
      case "Escape":
        invitesection.checkVisibility() ? hideModal(invitesection) : ""
        uploadsection.checkVisibility() ? hideModal(uploadsection) : ""
        break;
    }
  });

input.addEventListener("change", () => {
  const files = input.files!;

  if (!files.length) {
    fileInfo.textContent = t("noFileSelected");
    return;
  }

  if (files.length === 1) {
    fileInfo.textContent = t("fileSelectedSingle");
  } else {
    fileInfo.textContent = `${files.length} ${t("filesSelected")}`;
  }
});

await requireAuth();
const userLanguage = await getUserLanguage();
setLanguage(userLanguage);
updateLanguageToggleIcon(userLanguage);
applyTranslations();
await startUpload();

await initMap();

setOnCountryChange((country) => {
  selectCountry(country);
});