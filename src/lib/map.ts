import "leaflet/dist/leaflet.css";
import L from "leaflet";

let map: L.Map;
let currentLayer: L.GeoJSON | null = null;
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
    link.classList.remove('active');
    if (link.getAttribute('href') === `#page_${country}`) {
      link.classList.add('active');
    }
  });
}

function loadCountryData(country: string) {
  if (currentLayer) {
    map.removeLayer(currentLayer);
  }

  fetch(`/src/geo/${country}.json`)
    .then((res) => res.json())
    .then((data) => {
      L.geoJSON(data, {
        style: {
          color: "#2c3e50",
          weight: 2,
          fillOpacity: 0.2,
        },
      }).addTo(map);
    });
}

initMap();
