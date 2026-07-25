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
import {
  COUNTRIES,
  determineSection,
  type CountryCode,
  getCountryName,
  isCountryCode,
} from "./geo";
import "./gallery.ts";
import { getCountryIndex, snapTo, updateUnvisitedMarkers } from "./slider.ts";
import {
  currentGalleryDescription,
  currentGalleryEntryId,
  loadPhotosOfMarker,
  showPhotoGallery,
} from "./gallery.ts";

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

// Sicherheitsnetz gegen einen unerwartet großen Datensatz pro Land (verhindert
// ein hängendes UI); bei normalem Betrieb bleibt die Zahl der Stationen pro
// Land weit darunter.
const MAX_ENTRIES_PER_COUNTRY = 500;

const markers = new Map<string, L.Marker>();
const latestEntry = await getLatestEntry();
export let currentCountry: CountryCode | "DE" = "DE";
export let map: L.Map;
let isInitialized = false;
let markerCluster: L.MarkerClusterGroup;
let visitedMarkers: Set<string> = new Set();
export let unvisitedEntries = 0;
let unvisitedCountsByCountry = new Map<CountryCode, number>();
let routeLine: L.Polyline;
let routeGlow: L.Polyline;
let routeAnimationFrame: number | null = null;
let lastRouteKey: string | null = null;
let activeMarkersRequestId = 0;
let countrySyncTimer: number | null = null;
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
  await loadUnvisitedCountsByCountry();

  map.on("moveend", handleMapViewportChanged);
  map.on("zoomend", handleMapViewportChanged);

  if (latestEntry?.section && latestEntry?.section != null) {
    const initialCountry = isCountryCode(latestEntry.section)
      ? latestEntry.section
      : "DE";
    currentCountry = initialCountry;
    selectCountry(initialCountry);
    await setCardText(initialCountry);
  }
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

export function selectCountry(
  country: CountryCode,
  options: { flyTo?: boolean; syncSlider?: boolean } = {},
) {
  const { flyTo = true, syncSlider = true } = options;
  const normalizedCountry = isCountryCode(country) ? country : "DE";

  if (currentCountry === normalizedCountry && markers.size > 0) {
    return;
  }

  currentCountry = normalizedCountry;
  clearMarkers();
  const config = COUNTRIES[normalizedCountry];
  if (!config) return;

  if (flyTo) {
    map.flyTo(config.center, config.zoom, {
      duration: 1,
    });
  }

  void loadMarkersInView();
  void setCardText(normalizedCountry);

  if (syncSlider) {
    const countryIndex = getCountryIndex(normalizedCountry);
    if (countryIndex !== -1) {
      snapTo(countryIndex, false);
    }
  }
}

export async function setCardText(country: CountryCode) {
  const card = document.getElementById("country-card") as HTMLDivElement;
  const user = await getUser();
  const firstName = escapeHtml(user?.user_metadata?.first_name ?? "");

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
        ${escapeHtml(title)}
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

async function loadMarkersInView() {
  if (!currentCountry) return;

  const requestId = ++activeMarkersRequestId;

  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, latitude, longitude, title, description, user_id, taken_at, created_at, visited_entries(count), photos!photos_entry_id_fkey(count)",
    )
    .eq("section", currentCountry)
    .order("created_at", { ascending: true })
    .limit(MAX_ENTRIES_PER_COUNTRY);

  if (error) {
    console.error(error);
    return;
  }

  if (requestId !== activeMarkersRequestId) {
    return;
  }

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
  await refreshMarkers();
}

// Lädt die Marker des aktuellen Landes neu, z. B. nachdem ein neuer Eintrag
// hochgeladen wurde und sofort auf der Karte sichtbar werden soll.
export async function refreshMarkers() {
  clearMarkers();
  // Reset the cached route key so the route is re-animated after markers reload.
  lastRouteKey = null;
  await loadMarkersInView();
}

function handleMapViewportChanged() {
  if (countrySyncTimer) {
    window.clearTimeout(countrySyncTimer);
  }

  countrySyncTimer = window.setTimeout(() => {
    void syncCountryFromMap();
  }, 180);
}

async function syncCountryFromMap() {
  if (!map || !isInitialized) return;

  const bounds = map.getBounds();
  const points = [
    map.getCenter(),
    bounds.getNorthEast(),
    bounds.getNorthWest(),
    bounds.getSouthEast(),
    bounds.getSouthWest(),
  ];

  const detectedCountries = new Set<CountryCode>();

  for (const point of points) {
    const detectedCountry = await determineSection(point.lat, point.lng);
    if (detectedCountry !== "Unknown") {
      detectedCountries.add(detectedCountry);
    }
  }

  const centerCountry = await determineSection(
    map.getCenter().lat,
    map.getCenter().lng,
  );

  const nextCountry =
    centerCountry !== "Unknown"
      ? centerCountry
      : detectedCountries.values().next().value;

  if (!nextCountry || nextCountry === currentCountry) {
    return;
  }

  selectCountry(nextCountry, { flyTo: false, syncSlider: true });
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

function renderMarkers(entries: any[], requestId = activeMarkersRequestId) {
  const totalEntries = entries.length;
  const staggerDelay = Math.min(
    40,
    Math.max(18, Math.round(800 / Math.max(1, totalEntries))),
  );

  entries.forEach((entry, index) => {
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

    window.setTimeout(() => {
      if (requestId !== activeMarkersRequestId) return;
      if (markers.has(entry.id)) return;

      markerCluster.addLayer(marker);
      markers.set(entry.id, marker);

      window.requestAnimationFrame(() => {
        const el = marker.getElement();
        if (!el) return;
        el.classList.add("marker-pop-in");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("marker-pop-in"),
          { once: true },
        );
      });
    }, index * staggerDelay);
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

// Ermittelt je Land, wie viele Stationen für den aktuellen Nutzer noch unbesucht sind,
// damit die Slider-Bar an den entsprechenden Landesflaggen eine Markierung anzeigen kann.
async function loadUnvisitedCountsByCountry() {
  const { data, error } = await supabase.from("entries").select("id, section");

  if (error) {
    console.error(error);
    return;
  }

  const counts = new Map<CountryCode, number>();
  for (const entry of data ?? []) {
    if (!isCountryCode(entry.section) || visitedMarkers.has(entry.id)) continue;
    counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
  }

  unvisitedCountsByCountry = counts;
  updateUnvisitedMarkers(unvisitedCountsByCountry);
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

  const remainingUnvisited = Math.max(
    0,
    (unvisitedCountsByCountry.get(currentCountry) ?? 0) - 1,
  );
  unvisitedCountsByCountry.set(currentCountry, remainingUnvisited);
  updateUnvisitedMarkers(unvisitedCountsByCountry);

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
  if (routeAnimationFrame) {
    cancelAnimationFrame(routeAnimationFrame);
    routeAnimationFrame = null;
  }

  markerCluster.clearLayers();
  markers.clear();
  routeGlow.setLatLngs([]);
  routeLine.setLatLngs([]);
}

let locationPickerBanner: HTMLDivElement | null = null;

function ensureLocationPickerBanner(): HTMLDivElement {
  if (locationPickerBanner) return locationPickerBanner;

  const banner = document.createElement("div");
  banner.id = "location-picker-banner";
  banner.className = "location-picker-banner";
  banner.innerHTML = `
    <span class="location-picker-text"></span>
    <div class="location-picker-buttons">
    <button type="button" class="nav-button" id="location-picker-confirm"></button>
    <button type="button" class="nav-button" id="location-picker-cancel"></button>
    </div>
  `;
  document.body.appendChild(banner);
  locationPickerBanner = banner;
  return banner;
}

// Lässt den Nutzer den Standort für Fotos ohne GPS-EXIF-Daten manuell auf der Karte festlegen.
// Der vorläufige Marker (gleiches Icon wie im Edit Mode) kann per Drag oder erneutem Klick
// verschoben werden, bleibt dabei auch über Zoom-Änderungen hinweg an Ort und Stelle und wird
// erst über den OK-Button endgültig übernommen bzw. über Cancel/Escape verworfen.
export function pickLocationOnMap(): Promise<{
  lat: number;
  lng: number;
} | null> {
  return new Promise((resolve) => {
    if (!map) {
      resolve(null);
      return;
    }

    const banner = ensureLocationPickerBanner();
    const text = banner.querySelector(
      ".location-picker-text",
    ) as HTMLSpanElement;
    const confirmBtn = banner.querySelector(
      "#location-picker-confirm",
    ) as HTMLButtonElement;
    const cancelBtn = banner.querySelector(
      "#location-picker-cancel",
    ) as HTMLButtonElement;

    let tempMarker: L.Marker | null = null;

    function updateHint() {
      text.textContent = tempMarker
        ? t("adjustLocationHint")
        : t("pickLocationHint");
    }

    confirmBtn.textContent = t("confirmLocation");
    cancelBtn.textContent = t("cancel");
    confirmBtn.style.display = "none";
    updateHint();

    const container = map.getContainer();
    banner.classList.add("active");
    container.classList.add("picking-location");

    function removeTempMarker() {
      if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
      }
    }

    function placeMarker(latlng: L.LatLng) {
      if (tempMarker) {
        tempMarker.setLatLng(latlng);
        return;
      }

      const icon = L.icon({
        iconUrl: editMarkerIconUrl,
        iconSize: [42, 42],
        iconAnchor: [20, 42],
        className: "temp-location-marker",
      });

      tempMarker = L.marker(latlng, { icon, draggable: true }).addTo(map);
      confirmBtn.style.display = "";
      updateHint();
    }

    function finish(result: { lat: number; lng: number } | null) {
      map.off("click", onMapClick);
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeydown);
      removeTempMarker();
      banner.classList.remove("active");
      container.classList.remove("picking-location");
      resolve(result);
    }

    function onMapClick(e: L.LeafletMouseEvent) {
      placeMarker(e.latlng);
    }

    function onConfirm() {
      if (!tempMarker) return;
      const { lat, lng } = tempMarker.getLatLng();
      finish({ lat, lng });
    }

    function onCancel() {
      finish(null);
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    }

    map.on("click", onMapClick);
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}
