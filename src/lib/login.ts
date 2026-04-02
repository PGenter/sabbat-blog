import { supabase } from "../lib/supabase";

const loginSection = document.getElementById("login-section")!;
const mapSection = document.getElementById("map-section")!;
const loginForm = document.getElementById("login-form")!;
const logoutButton = document.getElementById("logout")!;
const mapFilter = document.getElementById("map-filter")!;
const map = document.getElementById("map")!;

init();

async function init() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    showLogin();
  } else {
    const user = data.session.user;
    const role = user.app_metadata?.role || "user";
    showApp();
    if (role === "superuser") {
      showUpload();
    } else {
      hideUpload();
    }
  }
}

function showLogin() {
  loginSection.style.display = "block";
  mapSection.style.display = "none";
  mapFilter.style.display = "block";
    map.style.pointerEvents = "none";
}

function showApp() {
  loginSection.style.display = "none";
  mapSection.style.display = "flex";
  mapFilter.style.display = "none";
    map.style.pointerEvents = "auto";
}

function showUpload() {
  const btn = document.createElement("button");
  const wrapper = document.getElementById("button_wrapper")!;
  btn.className = "nav-button glassy";
  btn.id = "upload";
  btn.title = "Upload";
  btn.innerHTML = `<i class="bi bi-cloud-arrow-up"></i>`;
  wrapper.appendChild(btn);
}

function hideUpload() {
  const uploadButton = document.getElementById("upload");
  if (uploadButton) {
    uploadButton.style.display = "none";
  }
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
  } else {
    showApp();
  }
});

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});
