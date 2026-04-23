import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L, { icon } from "leaflet";
import { supabase } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode } from "./geo";
import "./slider.ts";
import "./gallery.ts";
// import { snapTo } from "./slider.ts";

const markers = new Map<string, L.Marker>();
let currentCountry: CountryCode | null = null;
export let map: L.Map;
let markerCluster: L.MarkerClusterGroup;
let debounceTimer: number | null = null;
// let routeLine: L.Polyline;

export async function initMap() {
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

  currentCountry = "DE";
  
  const latestEntry = await getLatestEntry();
  if(latestEntry?.section && latestEntry?.section != null){
    currentCountry = latestEntry.section;
    selectCountry(latestEntry.section);
  }
  
  map.on("moveend", handleViewportChanged);
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
  id: string,
  takenAt: string,
  createdAt: string,
  userId: string,
) {
  // const icon = L.divIcon({
  //   className: "map-marker",
  // });

  var iconOptions = {
    // iconUrl: "../../public/assets/marker/pin-32.png",
    // iconUrl: "../../public/assets/marker/photo-48.png",
    iconUrl: "../../assets/marker/camera-48-new.png",
    // iconSize: [48, 48],
  };

  var customIcon = L.icon(iconOptions);

  var markerOptions: L.MarkerOptions = {
    title:
      "Upload am " +
      new Date(createdAt).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    icon: customIcon,
  };

  const marker = L.marker([lat, lng], markerOptions).on("click", () =>
    showPhotoGallery(id, title, takenAt, createdAt, userId),
  );

  requestAnimationFrame(() => {
    const el = marker.getElement();
    el?.classList.add("visible");
  });

  return marker;
}

function showPhotoGallery(
  entryId: string,
  title: string,
  takenAt: string,
  createdAt: string,
  userId: string,
) {
  loadPhotosOfMarker(entryId, title);
}

async function loadPhotosOfMarker(entryId: string, title: string) {
  if (!entryId) return;

  const { data, error } = await supabase
    .from("photos")
    .select("id, user_id, taken_at, created_at, image_url, thumbnail_url")
    .eq("entry_id", entryId)
    .order("taken_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  renderPhotos(data, title);
}

function renderPhotos(photos: any[], title: string) {
  const gallery = document.getElementById("photo-gallery") as HTMLDivElement;
  const header = document.getElementById("photo-header") as HTMLDivElement;
  header.innerHTML = `<h2>${COUNTRIES[currentCountry!].name}</h2> 
                      <div class="close-button-container">
                        <button class="close-button" id="close-button">X</button>
                      </div>`;

  const closeButton = document.getElementById(
    "close-button",
  ) as HTMLButtonElement;
  closeButton.addEventListener("click", () => {
    const gallery = document.getElementById("photo-gallery") as HTMLDivElement;
    gallery.classList.remove("active");
  });

  const carouselGallery = document.getElementById(
    "carousel-gallery",
  ) as HTMLDivElement;
  const thumbnailGallery = document.getElementById(
    "thumbnail-gallery",
  ) as HTMLDivElement;
  const firstPhoto = photos[0];
  const total = photos.length;
  carouselGallery.innerHTML = ""; // Clear previous photos
  thumbnailGallery.innerHTML = ""; // Clear previous thumbnails
  gallery.classList.add("active");
  photos.forEach((photo, index) => {
    if (index === 0) {
      createPhoto(photo, index);
      return;
    }

    createPhoto(photo, index);
    createThumbnail(photo);
  });

  createThumbnail(firstPhoto);

  function createPhoto(photo: any, index: number) {
    const imgContainer = document.createElement("div");
    const img = document.createElement("img");
    const itemImg = document.createElement("div");
    const itemContent = document.createElement("div");
    const itemNo = document.createElement("div");
    // const itemCountry = document.createElement("div");
    const itemTakenAt = document.createElement("div");
    const itemDescription = document.createElement("div");
    const takenAt = new Date(photo.taken_at).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    img.src = photo.image_url;
    img.alt = title;
    // img.title = title;
    itemNo.textContent = `Bild ${index + 1} von ${total}`;
    // itemCountry.textContent = COUNTRIES[currentCountry!].name || "Unknown";
    itemTakenAt.textContent = takenAt;
    itemDescription.textContent = title || "";

    imgContainer.classList.add("item");
    itemImg.classList.add("item-img");
    itemContent.classList.add("item-content");
    itemNo.classList.add("item-no");
    // itemCountry.classList.add("item-country");
    itemTakenAt.classList.add("item-date");
    itemDescription.classList.add("item-description");

    carouselGallery.appendChild(imgContainer);
    imgContainer.appendChild(itemImg);
    imgContainer.appendChild(itemContent);
    itemImg.appendChild(img);
    // itemContent.appendChild(itemCountry);
    itemContent.appendChild(itemNo);
    itemContent.appendChild(itemTakenAt);
    itemContent.appendChild(itemDescription);
  }

  function createThumbnail(photo: any) {
    const thumbItem = document.createElement("div");
    const thumbImg = document.createElement("img");
    thumbImg.src = photo.thumbnail_url;
    thumbImg.alt = title;
    thumbItem.classList.add("item");
    thumbItem.appendChild(thumbImg);
    const thumbnailGallery = document.getElementById(
      "thumbnail-gallery",
    ) as HTMLDivElement;
    thumbnailGallery.appendChild(thumbItem);
  }
}

// function loadFullImage(url: string, takenAt: string, createdAt: string) {
//   const photoContainer = document.getElementById(
//     "active-photo-container",
//   ) as HTMLDivElement;
//   const fullImg = document.createElement("img");
//   fullImg.src = url;
//   fullImg.alt = `Photo taken at ${takenAt}`;
//   fullImg.title = `Taken at: ${takenAt}\nUploaded at: ${createdAt}`;
//   fullImg.classList.add("full-photo");
//   photoContainer.innerHTML = ""; // Clear previous photo
//   photoContainer.appendChild(fullImg);
// }

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
    .select(
      "id, latitude, longitude, description, user_id, taken_at, created_at",
    )
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

async function getLatestEntry() {
  const { data: latestEntry, error } = await supabase
    .from("entries")
    .select(
      "created_at, section",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  return latestEntry;
}

function handleViewportChanged() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    loadMarkersInView();
  }, 200); // 200–300ms sweet spot
}

function renderMarkers(entries: any[]) {
  entries.forEach((entry) => {
    if (markers.has(entry.id)) return;

    const marker = createMarker(
      entry.latitude,
      entry.longitude,
      entry.description,
      // "../../public/assets/marker/pin-96.png",
      entry.id,
      entry.taken_at,
      entry.created_at,
      entry.user_id,
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
