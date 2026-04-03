import "bootstrap-icons/font/bootstrap-icons.css";
// import "./style.css";
// import "./lib/slider.ts";
import "../lib/map.ts";
import { supabase } from "../lib/supabase.ts";
import { clearMarkers } from "../lib/map.ts";
import { requireAuth } from "../lib/auth.ts";
// import "./lib/map";
// import { supabase } from "./lib/supabase";
// import { selectCountry } from "./lib/map";

// async function test() {
//   const { data, error } = await supabase.from("entries").select("*");

//   console.log("Data:", data, "Error:", error);
// }

// test();

// const buttons = document.querySelectorAll(".navbar_wrapper button");

// buttons.forEach((button) => {
//   button.addEventListener("click", () => {
//     const country = button.getAttribute("data-country");
//     if (country) {
//       selectCountry(country);
//     }
//   });
// });

// const loginSection = document.getElementById("login-section")!;
// const mapSection = document.getElementById("map-section")!;
const logoutButton = document.getElementById("logout")!;
// const mapFilter = document.getElementById("map-filter")!;
// const map = document.getElementById("map")!;

init();

async function init() {
  const { data } = await supabase.auth.getSession();

  // if (!data.session) {
  //   window.location.href = "/index.html";
  // }

  const user = data.session?.user;
  const role = user?.app_metadata?.role || "user";

  if (role === "superuser") {
    showUpload();
  } else {
    hideUpload();
  }

  //   if (!data.session) {
  //     showLogin();
  //   } else {
  //     const user = data.session.user;
  //     const role = user.app_metadata?.role || "user";
  //     showApp();
  //     console.log("User role:", role);
  //     if (role === "superuser") {
  //       showUpload();
  //     } else {
  //       hideUpload();
  //     }
  //   }
}

// function showLogin() {
//   loginSection.style.display = "block";
//   mapSection.style.display = "none";
//   mapFilter.style.display = "block";
//   map.style.pointerEvents = "none";
// }

// function showApp() {
//   loginSection.style.display = "none";
//   mapSection.style.display = "flex";
//   mapFilter.style.display = "none";
//   map.style.pointerEvents = "auto";
// }

function showUpload() {
  const btn = document.createElement("button");
  const wrapper = document.getElementById("button_wrapper")!;
  btn.className = "nav-button rnd-button glassy";
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

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  clearMarkers();
  await requireAuth();
  // window.location.href = "/index.html";
});

await requireAuth();