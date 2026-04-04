import "bootstrap-icons/font/bootstrap-icons.css";
import "../lib/map.ts";
import { supabase } from "../lib/supabase.ts";
import { clearMarkers } from "../lib/map.ts";
import { requireAuth } from "../lib/auth.ts";
import { startUpload } from "./upload.ts";

const logoutButton = document.getElementById("logout")!;
const uploadButton = document.getElementById("upload")!;
const closeButton = document.getElementById("close-button") as HTMLButtonElement;
const uploadsection = document.getElementById("upload-section") as HTMLDivElement;
const modalBackdrop = document.getElementById("modal-backdrop") as HTMLDivElement;
const input = document.getElementById('images') as HTMLInputElement;
const fileInfo = document.getElementById('file-info') as HTMLDivElement;

init();

async function init() {
  const { data } = await supabase.auth.getSession();

  const user = data.session?.user;
  const role = user?.app_metadata?.role || "user";

  if (role === "superuser") {
    showUpload();
  } else {
    hideUpload();
  }
}

function showUpload() {
  uploadButton.style.display = "block";
}

function hideUpload() {
  if (uploadButton) {
    uploadButton.style.display = "none";
  }
}

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  clearMarkers();
  await requireAuth();
});

uploadButton.addEventListener("click", () => {
  uploadsection.style.visibility = "visible";
  uploadsection.style.opacity = "1";
  modalBackdrop.classList.add("active");
});

closeButton.addEventListener("click", () => {
  uploadsection.style.visibility = "hidden";
  uploadsection.style.opacity = "0";
  modalBackdrop.classList.remove("active");
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