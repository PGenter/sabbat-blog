import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from '../lib/supabase';
import "leaflet.markercluster";

let map: L.Map;
// let currentLayer: L.GeoJSON | null = null;
let markerLayer: L.LayerGroup | null = null;
let activeCountry: string | null = null;

function initMap() {
  map = L.map("map").setView([51.5, 7], 9);
  // OpenStreetMap Layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
} 

export function selectCountry(country: string) {
  console.log("Aktives Land:", country);
  if (country === activeCountry) return;
  activeCountry = country;
  switch (country) {
    case "AU":
      // Karte initialisieren Australien
      // map = L.map("map").setView([-30, 150], 5);
      map.setView([-30, 148], 5.4);
      break;
    case "NZ":
      // Karte initialisieren Neuseeland
      map.setView([-40, 175], 5);
      break;
    case "FJ":
      // Karte initialisieren Fiji
      map.setView([-18, 175], 5);
      break;
    case "TAS":
      // Karte initialisieren Tasmanien
      map.setView([-43, 147.5], 9);
      break;
    default:
      // Standardkarte (Deutschland)
      map.setView([51.5, 7], 9);
      break;
  }
  setActiveNav(country);
  loadCountryData(country);
}

function setActiveNav(country: string) {
  document.querySelectorAll('.navbar_wrapper a').forEach(link => {
    link.classList.remove('active_nav');
    if (link.getAttribute('href') === `#page_${country}`) {
      link.classList.add('active_nav');
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
}

initMap();
