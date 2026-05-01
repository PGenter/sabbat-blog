import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { user, supabase } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode } from "./geo";
// import "./slider.ts";
import "./gallery.ts";

const markers = new Map<string, L.Marker>();
let currentCountry: CountryCode | "DE" = "DE";
export let map: L.Map;
let isInitialized = false;
let markerCluster: L.MarkerClusterGroup;
let debounceTimer: number | null = null;
let visitedMarkers: Set<string> = new Set();
let routeLine: L.Polyline;
let routeGlow: L.Polyline;
let routeAnimationFrame: number | null = null;
let lastRouteKey: string | null = null;

export async function initMap() {
  if (isInitialized) return;
  isInitialized = true;
  
  map = L.map("map", {
    zoomControl: false,
    tapHold: true,
    inertia: true,
  }).setView([51.5, 7], 9);
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap & CartoDB",
    },
  ).addTo(map);

  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50, // wie aggressiv gruppiert wird
  });

  map.addLayer(markerCluster);

  routeGlow = L.polyline([], {
    color: "#768542",
    opacity: 0.2,
    weight: 10,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);
  routeLine = L.polyline([], {
    color: "#768542",
    opacity: 0.9,
    weight: 3,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  const latestEntry = await getLatestEntry();
  if (latestEntry?.section && latestEntry?.section != null) {
    currentCountry = latestEntry.section;
    selectCountry(latestEntry.section);
  }
  await loadVisitedMarkers();
  map.on("moveend", handleViewportChanged);
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
}

function getRouteKey(entries: any[]) {
  return entries.map((e) => e.id).join("-");
}

function animateRoute(entries: any[]) {
  if (!entries || entries.length < 2) return;

  if (routeAnimationFrame) {
    cancelAnimationFrame(routeAnimationFrame);
  }

  routeGlow.setLatLngs([]);
  routeLine.setLatLngs([]);

  const points = entries.map(
    (e) => [e.latitude, e.longitude] as [number, number],
  );

  let segmentIndex = 0;
  let progress = 0;

  const speed = 0.02; // kleiner = langsamer, größer = schneller

  let currentLatLngs: L.LatLngExpression[] = [points[0]];

  function interpolate(
    p1: [number, number],
    p2: [number, number],
    t: number,
  ): [number, number] {
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  }

  function draw() {
    if (segmentIndex >= points.length - 1) return;

    progress += speed;

    if (progress >= 1) {
      progress = 0;
      segmentIndex++;
      currentLatLngs.push(points[segmentIndex]);

      if (segmentIndex >= points.length - 1) {
        routeGlow.setLatLngs(currentLatLngs);
        routeLine.setLatLngs(currentLatLngs);
        return;
      }
    }

    const interpolatedPoint = interpolate(
      points[segmentIndex],
      points[segmentIndex + 1],
      progress,
    );

    routeGlow.setLatLngs([...currentLatLngs, interpolatedPoint]);
    routeLine.setLatLngs([...currentLatLngs, interpolatedPoint]);

    routeAnimationFrame = requestAnimationFrame(draw);
  }

  draw();
}

function createMarker(
  lat: number,
  lng: number,
  title: string,
  id: string,
  // takenAt: string,
  createdAt: string,
  // userId: string,
  views: number,
) {
  const isVisited = visitedMarkers.has(id);
  let icon;
  if (isVisited) {
    icon = "../../assets/marker/camera-48-visited.png";
  } else {
    icon = "../../assets/marker/camera-48-new.png";
  }

  // var iconOptions = {
  //   iconUrl: icon,
  // };

  var customIcon = L.icon({
    iconUrl: icon,
    iconSize: [48, 48],
    iconAnchor: [24, 42],
  });

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

  const marker = L.marker([lat, lng], markerOptions).on(
    "click",
    () => (showPhotoGallery(id, title), setMarkerVisited(id)),
  );

  marker.bindTooltip(
    `<div class="tooltip-inner">
     <div class="tooltip-date">
       ${new Date(createdAt).toLocaleDateString("de-DE")}
     </div>
     <div class="bi bi-eye tooltip-views">
      ${views}
     </div>
   </div>`,
    {
      className: isVisited ? "visited-marker" : "unvisited-marker",
      direction: "top",
      offset: [2, -42],
    },
  );

  requestAnimationFrame(() => {
    const el = marker.getElement();
    el?.classList.add("visible");
  });

  return marker;
}

function showPhotoGallery(entryId: string, title: string) {
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
    const itemTakenAt = document.createElement("div");
    const itemDescription = document.createElement("div");
    const takenAt = new Date(photo.taken_at).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    img.src = photo.image_url;
    img.alt = title;
    itemNo.textContent = `Bild ${index + 1} von ${total}`;
    itemTakenAt.textContent = takenAt;
    itemDescription.textContent = title || "";

    imgContainer.classList.add("item");
    itemImg.classList.add("item-img");
    itemContent.classList.add("item-content");
    itemNo.classList.add("item-no");
    itemTakenAt.classList.add("item-date");
    itemDescription.classList.add("item-description");

    carouselGallery.appendChild(imgContainer);
    imgContainer.appendChild(itemImg);
    imgContainer.appendChild(itemContent);
    itemImg.appendChild(img);
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
      "id, latitude, longitude, description, user_id, taken_at, created_at, visited_entries(count)",
    )
    .eq("section", currentCountry)
    .gte("latitude", bounds.south)
    .lte("latitude", bounds.north)
    .gte("longitude", bounds.west)
    .lte("longitude", bounds.east)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }
  removeMarkersOutsideViewport();
  renderMarkers(data);

  const routeKey = getRouteKey(data);

  if (routeKey !== lastRouteKey) {
    lastRouteKey = routeKey;
    animateRoute(data);
  }
}

async function getLatestEntry() {
  const { data: latestEntry, error } = await supabase
    .from("entries")
    .select("created_at, section")
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
      entry.id,
      // entry.taken_at,
      entry.created_at,
      // entry.user_id,
      entry.visited_entries?.[0]?.count ?? 0,
    );
    markerCluster.addLayer(marker);
    markers.set(entry.id, marker);
  });
}

async function loadVisitedMarkers() {
  const { data: visited, error } = await supabase
    .from("visited_entries")
    .select("entry_id")
    .eq("user_id", user?.id);

  if (error) {
    console.error(error);
    return;
  }

  visitedMarkers = new Set(visited?.map((v) => v.entry_id));
}

async function setMarkerVisited(entryId: string) {
  await supabase.from("visited_entries").upsert({
    user_id: user?.id,
    entry_id: entryId,
    visited_at: new Date().toISOString(),
  });

  visitedMarkers.add(entryId);

  const marker = markers.get(entryId);
  if (marker) {
    const icon = L.icon({
      iconUrl: "../../assets/marker/camera-48-visited.png",
    });

    marker.setIcon(icon);
  }
}

export function clearMarkers() {
  markerCluster.clearLayers();
  markers.clear();
  routeGlow.setLatLngs([]);
  routeLine.setLatLngs([]);
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

// initMap();
