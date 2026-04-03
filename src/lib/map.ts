import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode } from "./geo";
import "./slider.ts"
import { snapTo } from "./slider.ts";

const markers = new Map<string, L.Marker>();
let currentCountry: CountryCode | null = null;
let map: L.Map;
// let markerLayer: L.LayerGroup | null = null;
let markerCluster: L.MarkerClusterGroup;
let debounceTimer: number | null = null;
// let routeLine: L.Polyline;

export function initMap() {
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

  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50, // wie aggressiv gruppiert wird
  });

  map.addLayer(markerCluster);

  // routeLine = L.polyline([], {
  //   color: "#ff5a5f",
  //   weight: 3,
  //   opacity: 0.7,
  // }).addTo(map);

  map.on("moveend", handleViewportChanged);
  currentCountry = "DE";
  // selectCountry(currentCountry);
  // snapTo(4);

  handleViewportChanged();

  // loadCountryData("DE");
}

export function selectCountry(country: CountryCode) {
  currentCountry = country;
  clearMarkers();
  const config = COUNTRIES[country];
  if (!config) return;
  map.flyTo(config.center, config.zoom, {
    duration: 2,
  });
  const card = document.getElementById("country-card") as HTMLDivElement;
  card.innerHTML = `<h2>${COUNTRIES[country].name}</h2>`;
  // updateRoute(country);
  // setActiveNav(country);
  // loadCountryData(country);
}

// function updateRoute(country: CountryCode) {
//   const config = COUNTRIES[country];

//   if (!config) return;
//   routeLine.addLatLng(config.center);
// }

// function setActiveNav(country: CountryCode) {
//   document.querySelectorAll(".navbar_wrapper button").forEach((link) => {
//     link.classList.remove("active_nav");
//     if (link.getAttribute("data-country") === country) {
//       link.classList.add("active_nav");
//     }
//   });
// }

// async function loadCountryData(country: CountryCode) {
//   if (markerLayer) {
//     map.removeLayer(markerLayer);
//   }

//   markerLayer = L.layerGroup().addTo(map);

//   const { data, error } = await supabase
//     .from("entries")
//     .select("*")
//     .eq("section", country);

//   if (error) {
//     console.error("Supabase error:", error);
//     return;
//   }

//   if (!data) return;

//   data.forEach((item) => {
//     createMarker(item.latitude, item.longitude, item.title, item.image_url);
//     // const marker = L.marker([item.latitude, item.longitude]);

//     // marker.bindPopup(`
//     //   <div style="max-width:200px">
//     //     <h4>${item.title ?? ""}</h4>
//     //     <img src="${item.image_url}" style="width:100%" />
//     //   </div>
//     // `);

//     // marker.addTo(markerLayer!);
//   });
//   setCountryCard(country);
// }

// function setCountryCard(country: CountryCode) {
//   const card = document.querySelector(".card_wrapper") as HTMLDivElement;
//   card.innerHTML = `<h2>${COUNTRIES[country].name}</h2>`;
// }

function createMarker(
  lat: number,
  lng: number,
  title: string,
  imageUrl: string,
) {
  const icon = L.divIcon({
    className: "map-marker",
  });

  // const marker = L.marker([lat, lng], { icon }).addTo(map);
  const marker = L.marker([lat, lng], { icon });

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

// function getViewportBounds() {
//   const bounds = map.getBounds();

//   return {
//     north: bounds.getNorth(),
//     south: bounds.getSouth(),
//     east: bounds.getEast(),
//     west: bounds.getWest(),
//   };
// }

function getViewportBoundsWithPadding(padding = 0.3) {
  const bounds = map.getBounds();
  const paddedBounds = bounds.pad(padding); // 0.3 = 30% größer als Viewport
  return {
    north: paddedBounds.getNorth(),
    south: paddedBounds.getSouth(),
    east: paddedBounds.getEast(),
    west: paddedBounds.getWest(),
  };
}

async function loadMarkersInView() {
  if (!currentCountry) return;

  const bounds = getViewportBoundsWithPadding(0.3); // Padding 30%

  const { data, error } = await supabase
    .from("entries")
    .select("id, latitude, longitude, description, id")
    .eq("section", currentCountry)
    .gte("latitude", bounds.south)
    .lte("latitude", bounds.north)
    .gte("longitude", bounds.west)
    .lte("longitude", bounds.east);

  if (error) {
    console.error(error);
    return;
  }

  removeMarkersOutsideViewport();
  renderMarkers(data);
}

function handleViewportChanged() {
  // if (!currentCountry) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    loadMarkersInView();
  }, 200); // 200–300ms sweet spot

  // const bounds = getViewportBounds();
  // const bounds = map.getBounds();

  // const { data, error } = await supabase
  //   .from("entries")
  //   .select("id, latitude, longitude, title, image_url")
  //   .eq("section", currentCountry)
  //   .gte("latitude", bounds.getSouth())
  //   .lte("latitude", bounds.getNorth())
  //   .gte("longitude", bounds.getWest())
  //   .lte("longitude", bounds.getEast());

  // if (error) {
  //   console.error(error);
  //   return;
  // }
  // removeMarkersOutsideViewport();
  // renderMarkers(data);
}

function renderMarkers(entries: any[]) {
  entries.forEach((entry) => {
    if (markers.has(entry.id)) return;

    const marker = createMarker(
      entry.latitude,
      entry.longitude,
      entry.title,
      entry.image_url,
    );
    markerCluster.addLayer(marker);
    markers.set(entry.id, marker);
  });
}

export function clearMarkers() {
  // markers.forEach((marker) => marker.remove());
  markerCluster.clearLayers();
  markers.clear();
}

function removeMarkersOutsideViewport() {
  const bounds = map.getBounds();

  markers.forEach((marker, id) => {
    const pos = marker.getLatLng();

    if (!bounds.contains(pos)) {
      markerCluster.removeLayer(marker);
      markers.delete(id);
    }
  });
}

// buttons.forEach((button) => {
//   button.addEventListener("click", () => {
//     const country = button.dataset.country;
//     if (!country) return;

//     selectCountry(country as CountryCode);

//   });
// });

initMap();
