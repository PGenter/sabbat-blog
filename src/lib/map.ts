import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import "leaflet.markercluster";

let map: L.Map;
let markerLayer: L.LayerGroup | null = null;

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    tapHold: true,
    inertia: true,
  }).setView([51.5, 7], 9);
  // OpenStreetMap Layer
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    // "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    // "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap & CartoDB",
    },
  ).addTo(map);
  setActiveNav("DE");
  loadCountryData("DE");
}

export function selectCountry(country: string) {
  console.log("Aktives Land:", country);
  // if (country === activeCountry) return;
  // activeCountry = country;
  switch (country) {
    case "AU":
      // Karte initialisieren Australien
      map.flyTo([-27, 135], 5);
      break;
    case "NZ":
      // Karte initialisieren Neuseeland
      map.flyTo([-40, 175], 5);
      break;
    case "FJ":
      // Karte initialisieren Fiji
      map.flyTo([-17.75, 177.15], 12);
      break;
    case "TAS":
      // Karte initialisieren Tasmanien
      map.flyTo([-43, 147.5], 9);
      break;
    default:
      // Standardkarte (Deutschland)
      map.flyTo([51.5, 7], 9);
      break;
  }
  setActiveNav(country);
  loadCountryData(country);
}

function setActiveNav(country: string) {
  document.querySelectorAll(".navbar_wrapper button").forEach((link) => {
    link.classList.remove("active_nav");
    if (link.getAttribute("data-country") === country) {
      link.classList.add("active_nav");
    }
  });
}

// function loadCountryData(country: string) {
//   if (currentLayer) {
//     map.removeLayer(currentLayer);
//     currentLayer = null;
//   }

//   fetch(`/src/geo/${country}.json`)
//     .then((res) => res.json())
//     .then((data) => {
//       currentLayer = L.geoJSON(data, {
//         style: {
//           color: "#2c3e50",
//           weight: 1,
//           fillOpacity: 0.1,
//         },
//       }).addTo(map);
//     });
// }

async function loadCountryData(country: string) {
  if (markerLayer) {
    map.removeLayer(markerLayer);
  }

  markerLayer = L.layerGroup().addTo(map);

  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("section", country);

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  if (!data) return;

  data.forEach((item) => {
    const marker = L.marker([item.latitude, item.longitude]);

    marker.bindPopup(`
      <div style="max-width:200px">
        <h4>${item.title ?? ""}</h4>
        <img src="${item.image_url}" style="width:100%" />
      </div>
    `);

    marker.addTo(markerLayer!);
  });
  setCountryCard(country);
}

function setCountryCard(country: string) {
  const card = document.querySelector(".card_wrapper") as HTMLDivElement;
  switch (country) {
    case "AU":
      card.innerHTML = `
        <h2>Australien</h2> 
        `
      break;
    case "NZ":
      card.innerHTML = `  
        <h2>Neuseeland</h2>
        `
      break;    
    case "FJ":
      card.innerHTML = `
        <h2>Fiji</h2> 
        `
      break;
    case "TAS":
      card.innerHTML = `
        <h2>Tasmanien</h2> 
        `
      break;
    default:
      card.innerHTML = `
        <h2>Deutschland</h2> 
        `
      break;
  }
}

initMap();
