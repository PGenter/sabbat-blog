import "bootstrap-icons/font/bootstrap-icons.css";
import "../lib/map.ts";
import "../lib/invite.ts";
import {
  getRole,
  getUser,
  supabase,
  requireAuth,
  getUserLanguage,
  updateUserLanguage,
} from "../lib/supabase.ts";
import {
  initMap,
  // selectCountry, // nur für die Slider-Leiste benötigt
  clearMarkers,
  map,
  toggleEditMode,
  refreshLanguage,
  openEntryFromLink,
} from "../lib/map.ts";
import {
  disablePushOnThisDevice,
  onNotificationOpen,
  registerServiceWorker,
  syncPushSubscription,
} from "../lib/notifications.ts";
import { setupNotificationSettings } from "../lib/notification-settings.ts";
// Slider-Leiste entfernt
// import { setOnCountryChange, updateCountryLabels } from "../lib/slider";
import { startUpload } from "./upload.ts";
import { focusFirstField, setBackgroundBlocked } from "../lib/modal.ts";
import {
  setLanguage,
  t,
  getLanguageFlag,
  getCurrentLanguage,
  getStoredLanguage,
  getLanguageFlagSet,
} from "../lib/i18n.ts";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

const logoutButton = document.getElementById("logout")!;
const uploadButton = document.getElementById("upload")!;
const editMapButton = document.getElementById("edit-map")!;
const editGalleryButton = document.getElementById("edit-gallery")!;
const inviteButton = document.getElementById("invite")!;
const notificationsButton = document.getElementById("notifications")!;
const notificationSection = document.getElementById(
  "notification-section",
) as HTMLDivElement;
const notificationCloseButton = document.getElementById(
  "notification-close-button",
) as HTMLButtonElement;
let notificationSettings:
  | ReturnType<typeof setupNotificationSettings>
  | undefined;
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
// const navwrapper = document.getElementById("nav-wrapper") as HTMLDivElement;
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
  if (editGalleryButton) {
    editGalleryButton.style.display = "none";
  }
  if (editMapButton) {
    editMapButton.style.display = "none";
  }
}

function showInvitationButton() {
  inviteButton.style.display = "block";
}

function hideInvitationButton() {
  if (inviteButton) {
    inviteButton.style.display = "none";
  }
}

function showModal(dialogType: HTMLDivElement) {
  dialogType.style.visibility = "visible";
  dialogType.style.opacity = "1";
  setBackgroundBlocked(true);
  map.scrollWheelZoom.disable();
  focusFirstField(dialogType);
}

export function hideModal(dialogType: HTMLDivElement) {
  dialogType.style.visibility = "hidden";
  dialogType.style.opacity = "0";
  setBackgroundBlocked(false);
  map.scrollWheelZoom.enable();
}

function updateLanguageToggleIcon(language: "german" | "spanish") {
  if (!languageToggleButton) return;
  const img = languageToggleButton.querySelector(
    "img",
  ) as HTMLImageElement | null;
  if (!img) return;
  img.src = getLanguageFlag(language);
  img.srcset = `${getLanguageFlagSet(language)} 2x`;
  img.alt = language === "german" ? "Deutsch" : "Español";
  languageToggleButton.title = t("languageToggleTitle");
}

function applyTranslations() {
  logoutButton.title = t("logout");
  uploadButton.title = t("upload");
  editMapButton.title = t("editMap");
  editGalleryButton.title = t("editGallery");
  inviteButton.title = t("invite");
  notificationsButton.title = t("notifications");
  notificationSettings?.applyTranslations();
  if (languageToggleButton) {
    languageToggleButton.title = t("languageToggleTitle");
  }

  const uploadTitle = uploadsection.querySelector(
    ".card-head h2",
  ) as HTMLElement | null;
  if (uploadTitle) uploadTitle.textContent = t("photoUpload");

  const titleEl = document.getElementById("title") as HTMLInputElement | null;
  const descriptionEl = document.getElementById(
    "description",
  ) as HTMLTextAreaElement | null;
  const titleEsEl = document.getElementById(
    "title-es",
  ) as HTMLInputElement | null;
  const descriptionEsEl = document.getElementById(
    "description-es",
  ) as HTMLTextAreaElement | null;
  const langFieldsHint = document.getElementById(
    "lang-fields-hint",
  ) as HTMLElement | null;
  const fileLabel = uploadsection.querySelector(
    ".file-label",
  ) as HTMLElement | null;
  const uploadBtn = document.getElementById(
    "uploadBtn",
  ) as HTMLButtonElement | null;
  const mobileGpsHint = document.getElementById(
    "mobile-gps-hint",
  ) as HTMLElement | null;

  if (titleEl) titleEl.placeholder = t("titlePlaceholderDe");
  if (descriptionEl) descriptionEl.placeholder = t("descriptionPlaceholderDe");
  if (titleEsEl) titleEsEl.placeholder = t("titlePlaceholderEs");
  if (descriptionEsEl)
    descriptionEsEl.placeholder = t("descriptionPlaceholderEs");
  if (langFieldsHint) langFieldsHint.textContent = t("languageFieldGroupHint");
  if (fileLabel) fileLabel.textContent = t("chooseImages");
  if (mobileGpsHint) mobileGpsHint.textContent = t("mobileGpsHint");
  if (
    fileInfo.textContent === "Kein Bild ausgewählt" ||
    fileInfo.textContent === "Keine Datei gewählt" ||
    fileInfo.textContent === "Ninguna imagen seleccionada"
  ) {
    fileInfo.textContent = t("noFileSelected");
  }
  if (uploadBtn)
    uploadBtn.innerHTML = `<i class="bi bi-cloud-arrow-up"></i> ${t("uploadStart")}`;

  const inviteTitle = invitesection.querySelector(
    ".card-head h2",
  ) as HTMLElement | null;
  if (inviteTitle) inviteTitle.textContent = t("newUserInvite");

  const firstName = document.getElementById(
    "firstName",
  ) as HTMLInputElement | null;
  const lastName = document.getElementById(
    "lastName",
  ) as HTMLInputElement | null;
  const emailInput = document.getElementById(
    "email",
  ) as HTMLInputElement | null;
  const inviteBtn = document.getElementById(
    "inviteBtn",
  ) as HTMLButtonElement | null;

  if (firstName) firstName.placeholder = t("firstNamePlaceholder");
  if (lastName) lastName.placeholder = t("lastNamePlaceholder");
  if (emailInput) emailInput.placeholder = t("emailPlaceholder");
  if (inviteBtn)
    inviteBtn.innerHTML = `<i class="bi bi-person-add"></i> ${t("inviteSend")}`;
}

logoutButton.addEventListener("click", async () => {
  // Gerät abmelden, sonst bekäme es nach dem Logout weiter Benachrichtigungen
  await disablePushOnThisDevice().catch((error) =>
    console.error("Abmelden der Benachrichtigungen fehlgeschlagen:", error),
  );
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

notificationsButton.addEventListener("click", () => {
  showModal(notificationSection);
  void notificationSettings?.refresh();
});

notificationCloseButton.addEventListener("click", () => {
  hideModal(notificationSection);
});

languageToggleButton.addEventListener("click", async () => {
  const currentLanguage = getCurrentLanguage();
  const newLanguage = currentLanguage === "german" ? "spanish" : "german";

  setLanguage(newLanguage);
  updateLanguageToggleIcon(newLanguage);
  applyTranslations();
  // updateCountryLabels();
  await updateUserLanguage(newLanguage);
  void syncPushSubscription(newLanguage);
  await refreshLanguage();
});

document.body.addEventListener("keydown", (event) => {
  const key = event.key;
  switch (key) {
    case "Escape":
      invitesection.checkVisibility() ? hideModal(invitesection) : "";
      uploadsection.checkVisibility() ? hideModal(uploadsection) : "";
      notificationSection.checkVisibility()
        ? hideModal(notificationSection)
        : "";
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
const initialLanguage = getStoredLanguage() || userLanguage;
setLanguage(initialLanguage);
updateLanguageToggleIcon(initialLanguage);
applyTranslations();
// Loader-Text aus i18n.ts (die Sprache aus dem Nutzerprofil kann von der
// gespeicherten abweichen, die das Inline-Skript in map.html verwendet)
const loaderText = document.getElementById("app-loader-text");
if (loaderText) loaderText.textContent = t("appLoading");
await startUpload();

// Benachrichtigungen: Service Worker, Einstellungsdialog, Klicks auf
// Benachrichtigungen bei bereits offener Karte
void registerServiceWorker();
const currentUser = await getUser();
if (currentUser) {
  notificationSettings = setupNotificationSettings({
    userId: currentUser.id,
    role: await getRole(),
    onDeviceStateChange: (enabled) => {
      const icon = notificationsButton.querySelector("i");
      icon?.classList.toggle("bi-bell-fill", enabled);
      icon?.classList.toggle("bi-bell", !enabled);
    },
  });
  notificationSettings.applyTranslations();
  void notificationSettings.refresh();
  void syncPushSubscription(initialLanguage);
}
onNotificationOpen((entryId, photoId) => {
  void openEntryFromLink(entryId, photoId);
});

await initMap();

// setOnCountryChange((country) => {
//   selectCountry(country);
// });
