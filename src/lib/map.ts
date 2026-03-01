import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

let map: L.Map;
function initMap(country: string) {
  switch (country) {
    case "AU":
      // Karte initialisieren Australien
      map = L.map("map").setView([-30, 150], 5);
      break;
    case "NZ":
      // Karte initialisieren Neuseeland
      map = L.map("map").setView([-40, 175], 5);
      break;
    case "FJ":
      // Karte initialisieren Fiji
      map = L.map("map").setView([-18, 175], 5);
      break;
    case "TAS":
      // Karte initialisieren Tasmanien
      map = L.map("map").setView([-42, 146], 5);
      break;
    default:
      // Standardkarte (Deutschland)
      map = L.map("map").setView([51.5, 7], 9);
      break;
  }

  // OpenStreetMap Layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  fetch("/src/geo/germany.json")
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

initMap("DE");
