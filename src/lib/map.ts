import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES } from "./geo";

type CountryCode = "DE" | "AU" | "TAS" | "NZ" | "FJ";
// const buttons = document.querySelectorAll(".navbar_wrapper button");

// const route = [
//   [-27, 135], // Australien
//   [-43, 147.5], // Tasmanien
//   [-40, 175], // Neuseeland
//   [-17.75, 177.15], // Fiji
// ];
// const countries:Record<CountryCode, { center: [number, number]; zoom: number }> = {
//   DE: { center: [51.5, 7], zoom: 9 },
//   AU: { center: [-27, 135], zoom: 5 },
//   TAS: { center: [-43, 147.5], zoom: 9 },
//   NZ: { center: [-40, 175], zoom: 5 },
//   FJ: { center: [-17.75, 177.15], zoom: 12 },
// };

// interface Stop {
//   label: string
//   country: CountryCode
// }

let map: L.Map;
let markerLayer: L.LayerGroup | null = null;
let routeLine: L.Polyline;

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

  routeLine = L.polyline([], {
    color: "#ff5a5f",
    weight: 3,
    opacity: 0.7,
  }).addTo(map);

  setActiveNav("DE");
  loadCountryData("DE");
}

export function selectCountry(country: CountryCode) {
  // console.log("Aktives Land:", country);
  const config = COUNTRIES[country];
  if (!config) return;
  // let coordinates: [number, number];
  // let zoomLevel: number;
  // switch (country) {
  //   case "AU":
  //     // Karte initialisieren Australien
  //     coordinates = [-27, 135];
  //     zoomLevel = 5;
  //     break;
  //   case "NZ":
  //     // Karte initialisieren Neuseeland
  //     coordinates = [-40, 175];
  //     zoomLevel = 5;
  //     break;
  //   case "FJ":
  //     // Karte initialisieren Fiji
  //     coordinates = [-17.75, 177.15];
  //     zoomLevel = 12;
  //     break;
  //   case "TAS":
  //     // Karte initialisieren Tasmanien
  //     coordinates = [-43, 147.5];
  //     zoomLevel = 9;
  //     break;
  //   default:
  //     // Standardkarte (Deutschland)
  //     coordinates = [51.5, 7];
  //     zoomLevel = 9;
  //     break;
  // }
  // map.flyTo(coordinates, zoomLevel, {
  //   duration: 2,
  //   easeLinearity: 0.25,
  // });
  map.flyTo(config.center, config.zoom, {
    duration: 2,
  });
  updateRoute(country);
  setActiveNav(country);
  loadCountryData(country);
}

function updateRoute(country: CountryCode) {
  const config = COUNTRIES[country];

  if (!config) return;
  routeLine.addLatLng(config.center);
}

function setActiveNav(country: CountryCode) {
  document.querySelectorAll(".navbar_wrapper button").forEach((link) => {
    link.classList.remove("active_nav");
    if (link.getAttribute("data-country") === country) {
      link.classList.add("active_nav");
    }
  });
}

async function loadCountryData(country: CountryCode) {
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
    createMarker(item.latitude, item.longitude);
    // const marker = L.marker([item.latitude, item.longitude]);

    // marker.bindPopup(`
    //   <div style="max-width:200px">
    //     <h4>${item.title ?? ""}</h4>
    //     <img src="${item.image_url}" style="width:100%" />
    //   </div>
    // `);

    // marker.addTo(markerLayer!);
  });
  setCountryCard(country);
}

function setCountryCard(country: CountryCode) {
  const card = document.querySelector(".card_wrapper") as HTMLDivElement;
  switch (country) {
    case "AU":
      card.innerHTML = `
        <h2>Australien</h2> 
        `;
      break;
    case "NZ":
      card.innerHTML = `  
        <h2>Neuseeland</h2>
        `;
      break;
    case "FJ":
      card.innerHTML = `
        <h2>Fiji</h2> 
        `;
      break;
    case "TAS":
      card.innerHTML = `
        <h2>Tasmanien</h2> 
        `;
      break;
    default:
      card.innerHTML = `
        <h2>Deutschland</h2> 
        `;
      break;
  }
}

function createMarker(lat: number, lng: number) {
  const icon = L.divIcon({
    className: "map-marker",
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);

  requestAnimationFrame(() => {
    const el = marker.getElement();
    el?.classList.add("visible");
  });

  return marker;
}

// buttons.forEach((button) => {
//   button.addEventListener("click", () => {
//     const country = button.dataset.country;
//     if (!country) return;
    
//     selectCountry(country as CountryCode);
    
//   });
// });

initMap();
