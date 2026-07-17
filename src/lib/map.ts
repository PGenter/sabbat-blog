import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { getUser, supabase } from "../lib/supabase";
import {
  formatCountText,
  getCurrentLanguage,
  // getLanguageCode,
  t,
} from "../lib/i18n.ts";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode, getCountryName } from "./geo";
import "./gallery.ts";
import { getCountryIndex, snapTo } from "./slider.ts";
import { currentGalleryDescription, currentGalleryEntryId, loadPhotosOfMarker, showPhotoGallery } from "./gallery.ts";

const newMarkerIconUrl = new URL(
  "../../assets/marker/cameraMarker-new.png",
  import.meta.url,
).href;
const visitedMarkerIconUrl = new URL(
  "../../assets/marker/cameraMarker-viewed.png",
  import.meta.url,
).href;
const editMarkerIconUrl = new URL(
  "../../assets/marker/cameraMarker-edit.png",
  import.meta.url,
).href;

const markers = new Map<string, L.Marker>();
const latestEntry = await getLatestEntry();
export let currentCountry: CountryCode | "DE" = "DE";
export let map: L.Map;
let isInitialized = false;
let markerCluster: L.MarkerClusterGroup;
let debounceTimer: number | null = null;
let visitedMarkers: Set<string> = new Set();
export let unvisitedEntries = 0;
let routeLine: L.Polyline;
let routeGlow: L.Polyline;
let routeAnimationFrame: number | null = null;
let lastRouteKey: string | null = null;
export let isEditMode = false;

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
    color: "#bfe264",
    opacity: 0.2,
    weight: 10,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);
  routeLine = L.polyline([], {
    color: "#bfe264",
    opacity: 1,
    weight: 3,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  await loadVisitedMarkers();
  await loadUnvisitedEntryCount();

  if (latestEntry?.section && latestEntry?.section != null) {
    currentCountry = latestEntry.section;
    selectCountry(latestEntry.section);
    await setCardText(latestEntry.section);
  }
  map.on("moveend", handleViewportChanged);
}

export function toggleEditMode(buttonName: string) {
  isEditMode = !isEditMode;
  const editButton = document.getElementById(buttonName) as HTMLButtonElement;
  const closeButton = document.getElementById(
    "close-button",
  ) as HTMLButtonElement;
  if (isEditMode) {
    editButton.classList.add("active");
    closeButton.disabled = true;
    document.body.classList.add("edit-mode");
  } else {
    editButton.classList.remove("active");
    closeButton.disabled = false;
    document.body.classList.remove("edit-mode");
  }
  // Reload markers to update click handlers (without clearing the route)
  markerCluster.clearLayers();
  markers.clear();
  loadMarkersInView();

  const gallery = document.getElementById(
    "photo-gallery",
  ) as HTMLDivElement | null;
  if (gallery?.classList.contains("active") && currentGalleryEntryId) {
    loadPhotosOfMarker(currentGalleryEntryId, currentGalleryDescription || "");
  }
}

export function selectCountry(country: CountryCode) {
  currentCountry = country;
  clearMarkers();
  const config = COUNTRIES[country];
  if (!config) return;
  map.flyTo(config.center, config.zoom, {
    duration: 1,
  });
  // Slider-Stop aktualisieren ohne Rückkopplung
  const countryIndex = getCountryIndex(country);
  if (countryIndex !== -1) {
    snapTo(countryIndex, false);
  }
}

export async function setCardText(country: CountryCode) {
  const card = document.getElementById("country-card") as HTMLDivElement;
  const user = await getUser();
  const firstName = user?.user_metadata?.first_name ?? "";

  card.innerHTML = `<h2>${t("hello")} ${firstName},</h2>
  <p>${t("welcomeLine1")}</p>
  <p>${t("welcomeLine2")}</p>
  <p>${t("currentLocation")} <u><b>${getCountryName(
    country,
    getCurrentLanguage(),
  )}</b></u>.</p>`;

  if (unvisitedEntries === 0) {
    card.innerHTML += `<p>${t("noNewStations")}</p>`;
  } else {
    card.innerHTML += `<p>${formatCountText(unvisitedEntries)}</p>`;
  }
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
  desc: string,
  id: string,
  createdAt: string,
  views: number,
  images: number,
) {
  const isVisited = visitedMarkers.has(id);
  const icon = isEditMode
    ? editMarkerIconUrl
    : isVisited
      ? visitedMarkerIconUrl
      : newMarkerIconUrl;

  var customIcon = L.icon({
    iconUrl: icon,
    iconSize: [42, 42],
    iconAnchor: [20, 42],
    className: isEditMode ? "editable-marker" : "normal-marker",
  });

  var markerOptions: L.MarkerOptions = {
    icon: customIcon,
    opacity: 0,
  };

  const marker = L.marker([lat, lng], markerOptions).on("click", () => {
    if (isEditMode) {
      showEditMenu(id, title);
    } else {
      showPhotoGallery(id, desc);
      setMarkerVisited(id);
    }
  });

  const editHint = isEditMode
    ? `<div class="tooltip-edit-hint"><i class="bi bi-pencil"></i> ${t(
        "editHint",
      )}</div>`
    : "";

  marker.bindTooltip(
    `<div class="tooltip-inner">
      <div class="tooltip-title">
        ${title}
      </div>
      <div class="tooltip-date">
        ${t("uploadLabel")}: ${new Date(createdAt).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}
      </div>
      <div class="bi bi-images tooltip-views">
        ${images}
      </div>
      <div class="bi bi-eye-fill tooltip-views">
        ${views}
      </div>
      ${editHint}
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

async function showEditMenu(entryId: string, currentTitle: string) {
  const user = await getUser();
  const role = user?.app_metadata?.role || "user";

  // Create modal if it doesn't exist
  let editModal = document.getElementById("edit-modal") as HTMLDivElement;
  if (!editModal) {
    editModal = document.createElement("div");
    editModal.id = "edit-modal";
    editModal.className = "modal";
    editModal.innerHTML = `
      <div class="card edit-cd glassy modal-content">
      <div id="dialog-header" class="dialog-header">
                        <div class="close-button-container">
                            <button class="header-button close-button" id="edit-close-button"><i
                                    class="bi bi-x"></i></button>
                        </div>
                    </div>
                    
        <div class="card-head">
          <h2>${t("editMarker")}</h2>
        </div>
        <div class="modal-container edit-container">
          <input type="text" id="edit-title" placeholder="${t(
            "titlePlaceholder",
          )}" required/>
          <button class="nav-button lg-button" id="save-edit-btn"><i class="bi bi-check"></i>${t(
            "save",
          )}</button>
          ${
            role === "administrator"
              ? `<button class="nav-button lg-button delete-btn" id="delete-entry-btn"><i class="bi bi-trash"></i>${t(
                  "delete",
                )}</button>`
              : ""
          }
        </div>
      </div>
    `;
    document.body.appendChild(editModal);
  }

  const titleInput = document.getElementById("edit-title") as HTMLInputElement;
  const saveBtn = document.getElementById("save-edit-btn") as HTMLButtonElement;
  const closeBtn = document.getElementById(
    "edit-close-button",
  ) as HTMLButtonElement;
  const deleteBtn = document.getElementById(
    "delete-entry-btn",
  ) as HTMLButtonElement | null;

  titleInput.value = currentTitle;

  // Show modal
  editModal.style.visibility = "visible";
  editModal.style.opacity = "1";
  const modalBackdrop = document.getElementById(
    "modal-backdrop",
  ) as HTMLDivElement;
  modalBackdrop.classList.add("active");
  map.scrollWheelZoom.disable();

  const closeModal = () => {
    editModal.style.visibility = "hidden";
    editModal.style.opacity = "0";
    modalBackdrop.classList.remove("active");
    map.scrollWheelZoom.enable();
  };

  closeBtn.onclick = closeModal;

  saveBtn.onclick = async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) return;

    // console.log("Updating entry", entryId, "with title", newTitle);

    const { error } = await supabase
      .from("entries")
      .update({ title: newTitle })
      .eq("id", entryId);

    console.log("Update result:", error);

    if (error) {
      console.error("Error updating entry:", error);
      alert(t("errorSaving") + error.message);
    } else {
      alert(t("save"));
      closeModal();
      // Reload markers to reflect changes
      clearMarkers();
      loadMarkersInView();
    }
  };

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (confirm(t("confirmDeleteEntry"))) {
        const { error } = await supabase
          .from("entries")
          .delete()
          .eq("id", entryId);

        if (error) {
          console.error("Error deleting entry:", error);
          alert(t("errorDeleting"));
        } else {
          alert(t("entryDeleted"));
          closeModal();
          // Reload markers
          clearMarkers();
          loadMarkersInView();
        }
      }
    };
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
      "id, latitude, longitude, title, description, user_id, taken_at, created_at, visited_entries(count), photos!photos_entry_id_fkey(count)",
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

export async function refreshLanguage() {
  if (!isInitialized) return;
  if (currentCountry) {
    await setCardText(currentCountry);
  }
  clearMarkers();
  // Reset the cached route key so the route is re-animated after markers reload.
  lastRouteKey = null;
  await loadMarkersInView();
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
  let delay = 0;
  entries.forEach((entry) => {
    if (markers.has(entry.id)) return;

    const marker = createMarker(
      entry.latitude,
      entry.longitude,
      entry.title,
      entry.description,
      entry.id,
      entry.created_at,
      entry.visited_entries?.[0]?.count ?? 0,
      entry.photos?.[0].count ?? 0,
    );
    markerCluster.addLayer(marker);
    markers.set(entry.id, marker);

    setTimeout(() => {
      marker.setOpacity(1);
    }, delay);

    delay += 80;
  });
}

async function loadVisitedMarkers() {
  const user = await getUser();
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

async function loadUnvisitedEntryCount() {
  const user = await getUser();
  if (!user?.id) {
    unvisitedEntries = 0;
    return;
  }

  const { count: totalEntries, error: totalError } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true });

  if (totalError) {
    console.error(totalError);
    unvisitedEntries = 0;
    return;
  }

  const { count: visitedCount, error: visitedError } = await supabase
    .from("visited_entries")
    .select("entry_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (visitedError) {
    console.error(visitedError);
    unvisitedEntries = totalEntries ?? 0;
    return;
  }

  unvisitedEntries = Math.max(0, (totalEntries ?? 0) - (visitedCount ?? 0));
}

async function setMarkerVisited(entryId: string) {
  const user = await getUser();
  await supabase.from("visited_entries").upsert({
    user_id: user?.id,
    entry_id: entryId,
    visited_at: new Date().toISOString(),
  });

  visitedMarkers.add(entryId);
  await loadUnvisitedEntryCount();

  const marker = markers.get(entryId);
  if (!marker) return;
  const icon = L.icon({
    iconUrl: visitedMarkerIconUrl,
    iconSize: [48, 48],
    iconAnchor: [24, 42],
    className: "normal-marker",
  });

  marker.setIcon(icon);

  const currentTooltip = marker.getTooltip();
  const content = currentTooltip?.getContent() ?? "";

  marker.unbindTooltip();
  marker.bindTooltip(content, {
    className: "visited-marker",
    direction: "top",
    offset: [2, -42],
  });
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

