import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode } from "./geo";

// type CountryCode = "DE" | "AU" | "TAS" | "NZ" | "FJ";
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
const markers = new Map<string, L.Marker>();
let currentCountry: CountryCode | null = null;
let map: L.Map;
let markerLayer: L.LayerGroup | null = null;
// let routeLine: L.Polyline;

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

  // routeLine = L.polyline([], {
  //   color: "#ff5a5f",
  //   weight: 3,
  //   opacity: 0.7,
  // }).addTo(map);

  map.on("moveend", handleViewportChanged);

  setActiveNav("DE");
  loadCountryData("DE");
}

export function selectCountry(country: CountryCode) {
  currentCountry = country;
  clearMarkers();
  // console.log("Aktives Land:", country);
  const config = COUNTRIES[country];
  if (!config) return;
  map.flyTo(config.center, config.zoom, {
    duration: 2,
  });
  // updateRoute(country);
  setActiveNav(country);
  loadCountryData(country);
}

// function updateRoute(country: CountryCode) {
//   const config = COUNTRIES[country];

//   if (!config) return;
//   routeLine.addLatLng(config.center);
// }

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
    createMarker(item.latitude, item.longitude, item.title, item.image_url);
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
  card.innerHTML = `<h2>${COUNTRIES[country].name}</h2>`;
}

function createMarker(
  lat: number,
  lng: number,
  title: string,
  imageUrl: string,
) {
  const icon = L.divIcon({
    className: "map-marker",
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);

  requestAnimationFrame(() => {
    const el = marker.getElement();
    el?.classList.add("visible");
  });

  marker.bindPopup(`
    <div style="max-width:200px">
      <h4>${title ?? ""}</h4>
      <img src="${imageUrl}" style="width:100%" />
    </div>
  `);

  return marker;
}

function getViewportBounds() {
  const bounds = map.getBounds();

  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };
}

async function handleViewportChanged() {

  if (!currentCountry) return;

  const bounds = getViewportBounds();

  const { data, error } = await supabase
    .from("entries")
    .select("id, latitude, longitude")
    .eq("section", currentCountry)
    .gte("latitude", bounds.south)
    .lte("latitude", bounds.north)
    .gte("longitude", bounds.west)
    .lte("longitude", bounds.east);

  if (error) {
    console.error(error);
    return;
  }

  renderMarkers(data);
}

function renderMarkers(entries:any[]) {

  entries.forEach(entry => {

    if (markers.has(entry.id)) return;

    const marker = createMarker(entry.latitude, entry.longitude, entry.title, entry.image_url);

    markers.set(entry.id, marker);

  });

}

function clearMarkers() {

  markers.forEach(marker => marker.remove());

  markers.clear();

}

// buttons.forEach((button) => {
//   button.addEventListener("click", () => {
//     const country = button.dataset.country;
//     if (!country) return;

//     selectCountry(country as CountryCode);

//   });
// });

initMap();
