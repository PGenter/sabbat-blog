import "bootstrap-icons/font/bootstrap-icons.css";
import "../lib/map.ts";
import "../lib/invite.ts"
import { role, supabase, requireAuth } from "../lib/supabase.ts";
import { initMap, selectCountry, clearMarkers, map } from "../lib/map.ts";
import { setOnCountryChange } from "../lib/slider";
// import { requireAuth } from "../lib/auth.ts";
import { startUpload } from "./upload.ts";


const logoutButton = document.getElementById("logout")!;
const uploadButton = document.getElementById("upload")!;
const inviteButton = document.getElementById("invite")!;
const uploadCloseButton = document.getElementById("upload-close-button") as HTMLButtonElement;
const inviteCloseButton = document.getElementById("invite-close-button") as HTMLButtonElement;
const uploadsection = document.getElementById("upload-section") as HTMLDivElement;
const invitesection = document.getElementById("invitation-section") as HTMLDivElement;
const mapWrapper = document.getElementById("map") as HTMLDivElement;
const navwrapper = document.getElementById("nav-wrapper") as HTMLDivElement;
const modalBackdrop = document.getElementById("modal-backdrop") as HTMLDivElement;
const input = document.getElementById('images') as HTMLInputElement;
const fileInfo = document.getElementById('file-info') as HTMLDivElement;

init();

async function init() {
  // const { data } = await supabase.auth.getSession();

  // const user = data.session?.user;
  // const role = user?.app_metadata?.role || "user";

  if (role === "superuser" || role === "administrator") {
    showUploadButton();
  } else {
    hideUploadButton();
  }
  
  if (role === "administrator") {
    showInvitationButton();
  } else {
    hideInvitationButton();
  }
}

function showUploadButton() {
  uploadButton.style.display = "block";
}

function hideUploadButton() {
  if (uploadButton) {
    uploadButton.style.display = "none";
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

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  clearMarkers();
  await requireAuth();
});

uploadButton.addEventListener("click", () => {
  showModal(uploadsection);
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

input.addEventListener('change', () => {
  const files = input.files!;

  if (!files.length) {
    fileInfo.textContent = 'Keine Datei gewählt';
    return;
  }

  if (files.length === 1) {
    fileInfo.textContent = files[0].name;
  } else {
    fileInfo.textContent = `${files.length} Dateien ausgewählt`;
  }
});

await requireAuth();
await startUpload();

await initMap();

setOnCountryChange((country) => {
  selectCountry(country);
});