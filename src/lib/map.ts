import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { getUser, supabase } from "../lib/supabase";
import {
  getCurrentLanguage,
  getLanguageCode,
  localizeEntryField,
  localizedEntryColumn,
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
// Slider-Leiste entfernt
// import { getCountryIndex, snapTo, updateUnvisitedMarkers } from "./slider.ts";
import {
  currentGalleryEntryId,
  loadPhotosOfMarker,
  refreshGalleryLanguage,
  showPhotoGallery,
} from "./gallery.ts";
import {
  createEntryList,
  type EntryList,
  type EntryListItem,
} from "./entry-list.ts";

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || "";

// Nur noch für den vorläufigen Marker beim manuellen Festlegen des Standorts.
const editMarkerIconUrl = new URL(
  "../../assets/marker/cameraMarker-edit.png",
  import.meta.url,
).href;

// Sicherheitsnetz gegen einen unerwartet großen Datensatz pro Land (verhindert
// ein hängendes UI); bei normalem Betrieb bleibt die Zahl der Stationen pro
// Land weit darunter.
const MAX_ENTRIES_PER_COUNTRY = 500;

// Dauer der Routen-Animation (die Marker blenden ebenso lange ein, siehe
// .marker-pop-in in style.css).
const ROUTE_ANIMATION_MS = 500;

// Zoomstufe, mit der die Karte beim Start auf die neueste Station fokussiert.
const FOCUS_ZOOM = 8;

// Flaggenbilder: dieselben Pfade wie im Länder-Slider (COUNTRIES[...].img)
function getCountryFlagUrl(code: CountryCode): string | undefined {
  return COUNTRIES[code]?.img;
}

type EntryItem = EntryListItem & { latitude: number; longitude: number };

const markers = new Map<string, L.Marker>();
const entryItems = new Map<string, EntryItem>();
export let currentCountry: CountryCode | "DE" = "DE";
export let map: L.Map;
let isInitialized = false;
let markerCluster: L.MarkerClusterGroup;
let entryList: EntryList | undefined;
let visitedMarkers: Set<string> = new Set();
let unvisitedCountsByCountry = new Map<CountryCode, number>();
let totalCountsByCountry = new Map<CountryCode, number>();
let routeLine: L.Polyline;
let routeGlow: L.Polyline;
let routeAnimationFrame: number | null = null;
let lastRouteKey: string | null = null;
let activeMarkersRequestId = 0;
let countrySyncTimer: number | null = null;
export let isEditMode = false;

// Hervorgehobener Eintrag (Hover/Fokus in der Liste) und der Eintrag, auf den
// nach dem Verlassen der Liste zurückgefallen wird (neueste Station beim Start).
let activeEntryId: string | null = null;
let baselineEntryId: string | null = null;
let pendingFocusId: string | null = null;
let focusedEntryId: string | null = null;
// verwirft veraltete Flüge, wenn schnell hintereinander navigiert wird
let focusToken = 0;
let hoverTimer: number | null = null;
// Während programmatischer Kartenbewegungen soll die Länder-Erkennung ruhen.
let suppressSyncUntil = 0;
// laufendes Laden der Marker des aktuellen Landes (für den Start-Loader)
let markersLoading: Promise<void> = Promise.resolve();
let panelResizeTimer: number | undefined;

export async function initMap() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    await setupMap();
  } finally {
    hideLoader();
  }
}

async function setupMap() {
  // Übersicht aller Stationen und besuchte Stationen parallel laden. Aus der
  // Übersicht ergeben sich die neueste Station (Startpunkt) und die Zahlen im
  // Länder-Dropdown – früher waren das vier Anfragen nacheinander.
  const [overview] = await Promise.all([
    loadEntryOverview(),
    loadVisitedMarkers(),
  ]);
  updateCountryCounts(overview);
  const latestEntry = overview[0];

  // Direkt auf die neueste Station starten, statt erst Deutschland zu laden.
  const start =
    latestEntry &&
    typeof latestEntry.latitude === "number" &&
    typeof latestEntry.longitude === "number"
      ? L.latLng(latestEntry.latitude, latestEntry.longitude)
      : null;

  map = L.map("map", {
    zoomControl: false,
    tapHold: true,
    inertia: true,
  }).setView(start ?? [51.5, 7], start ? FOCUS_ZOOM : 9);

  L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    {
      attribution: "&copy; OpenStreetMap & CartoDB",
    },
  ).addTo(map);

  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 30,
    iconCreateFunction: (cluster) => {
      const children = cluster.getAllChildMarkers();
      const hasUnvisited = children.some(
        (m) => !visitedMarkers.has((m.options as any).entryId),
      );

      return L.divIcon({
        html: `<div><span>${children.length}</span></div>`,
        className: `entry-cluster ${hasUnvisited ? "is-new" : "is-visited"}`,
        iconSize: L.point(40, 40),
      });
    },
  });

  map.addLayer(markerCluster);

  // Farben kommen aus map-ui.css (.route-glow / .route-line); die Werte hier
  // sind nur der Fallback, falls das Stylesheet fehlt.
  routeGlow = L.polyline([], {
    className: "route-glow",
    color: "#dcfa49",
    opacity: 0.5,
    weight: 10,
    interactive: false,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);
  routeLine = L.polyline([], {
    className: "route-line",
    color: "#a2ba2c",
    opacity: 1,
    weight: 4,
    interactive: false,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  entryList = createEntryList({
    onPreview: (id) => {
      // Touch-Geräte emulieren beim Tippen ein Hover; dort läuft alles über onSelect
      if (!canHover()) return;

      if (hoverTimer) window.clearTimeout(hoverTimer);

      // Beim Verlassen der Liste bleibt der zuletzt gehoverte Eintrag aktiv.
      if (!id) return;

      setActiveEntry(id);
      // kurz verzögern, damit schnelles Darüberfahren die Karte nicht hetzt
      hoverTimer = window.setTimeout(() => focusEntry(id), 160);
    },
    onSelect: (id) => {
      if (hoverTimer) window.clearTimeout(hoverTimer);

      // Touch: erster Tipp fokussiert den Marker, ein zweiter Tipp öffnet die Galerie
      if (!canHover() && focusedEntryId !== id) {
        focusEntry(id);
        return;
      }

      setActiveEntry(id);
      openEntry(id);
    },
    onToggle: () => {
      // Liste wurde ein-/ausgeklappt: der sichtbare Bereich hat sich geändert
      const id = activeEntryId ?? baselineEntryId;
      if (id) focusEntry(id);
    },
    onCountrySelect: (code) => {
      if (isCountryCode(code)) selectCountry(code);
    },
  });

  // Ändert sich die Größe der Liste (Laden, Filter, Drehen des Geräts) und
  // verdeckt sie danach den fokussierten Marker, wird nachzentriert.
  new ResizeObserver(() => {
    window.clearTimeout(panelResizeTimer);
    panelResizeTimer = window.setTimeout(keepFocusedEntryVisible, 150);
  }).observe(entryList.element);

  map.on("moveend", handleMapViewportChanged);
  map.on("zoomend", handleMapViewportChanged);

  const initialCountry: CountryCode = isCountryCode(latestEntry?.section)
    ? latestEntry.section
    : "DE";
  currentCountry = initialCountry;
  pendingFocusId = latestEntry?.id ?? null;
  selectCountry(initialCountry, { flyTo: false });

  // Erst ausblenden, wenn Liste und Marker stehen und die erste Zentrierung
  // (läuft in einem Animation-Frame) erledigt ist.
  await markersLoading;
  await nextFrame();
  await nextFrame();
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function hideLoader() {
  const loader = document.getElementById("app-loader");
  if (!loader) return;
  loader.classList.add("is-done");
  loader.addEventListener("transitionend", () => loader.remove(), {
    once: true,
  });
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
    loadPhotosOfMarker(currentGalleryEntryId);
  }
}

export function selectCountry(
  country: CountryCode,
  options: { flyTo?: boolean; syncSlider?: boolean } = {},
) {
  // syncSlider bleibt in der Signatur, wird ohne Slider-Leiste aber ignoriert
  const { flyTo = true } = options;
  const normalizedCountry = isCountryCode(country) ? country : "DE";

  if (currentCountry === normalizedCountry && markers.size > 0) {
    return;
  }

  currentCountry = normalizedCountry;
  activeEntryId = null;
  baselineEntryId = null;
  focusedEntryId = null;
  entryList?.setActive(null);
  clearMarkers();
  const config = COUNTRIES[normalizedCountry];
  if (!config) return;

  if (flyTo) {
    centerOn(config.center, { zoom: config.zoom });
  }

  markersLoading = loadMarkersInView();
  void setCardText(normalizedCountry);

  // if (syncSlider) {
  //   const countryIndex = getCountryIndex(normalizedCountry);
  //   if (countryIndex !== -1) {
  //     snapTo(countryIndex, false);
  //   }
  // }
}

// Der frühere Textbereich ist durch die Stationsliste ersetzt; die Funktion
// bleibt für bestehende Aufrufer erhalten und setzt den Ländernamen im Panel.
export async function setCardText(country: CountryCode) {
  entryList?.setCountry(
    getCountryName(country, getCurrentLanguage()),
    getCountryFlagUrl(country),
  );
  syncCountryMenu();
}

/* ==========================================================================
   Fokus und Zentrierung
   ========================================================================== */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Geräte ohne Hover (Touch): erster Tipp fokussiert, zweiter öffnet
function canHover() {
  return window.matchMedia("(hover: hover)").matches;
}

// Länderauswahl (Desktop) mit Flaggen und Anzahl neuer Stationen
function syncCountryMenu() {
  if (!entryList) return;

  const language = getCurrentLanguage();
  const options = (Object.keys(COUNTRIES) as CountryCode[]).map((code) => ({
    code,
    name: getCountryName(code, language),
    flagUrl: getCountryFlagUrl(code),
    total: totalCountsByCountry.get(code) ?? 0,
    newCount: unvisitedCountsByCountry.get(code) ?? 0,
  }));

  entryList.setCountries(options, currentCountry);
}

// Bereich der Karte, der nicht von der Liste verdeckt wird (Viewport-Koordinaten).
function getVisibleMapRect() {
  const c = map.getContainer().getBoundingClientRect();
  let left = Math.max(c.left, 0);
  let top = Math.max(c.top, 0);
  let right = Math.min(c.right, window.innerWidth);
  let bottom = Math.min(c.bottom, window.innerHeight);

  const panel = entryList?.element.getBoundingClientRect();
  if (panel && panel.width > 0 && panel.height > 0) {
    const margin = 16;
    if (panel.width >= (right - left) * 0.8) {
      // Bottom-Sheet (Hochformat): Liste liegt unten über der Karte
      bottom = Math.min(bottom, panel.top - margin);
    } else {
      // Seitenleiste (Querformat/Desktop): Liste liegt links über der Karte
      left = Math.max(left, panel.right + margin);
    }
  }

  return { left, top, right, bottom };
}

// Fokussierten Marker wieder freilegen, falls die Liste ihn jetzt verdeckt.
// Liegt der Marker außerhalb der Karte (vom Nutzer weggeschoben), bleibt alles,
// wie es ist.
function keepFocusedEntryVisible() {
  if (!map || Date.now() < suppressSyncUntil) return;

  const id = focusedEntryId ?? activeEntryId ?? baselineEntryId;
  const item = id ? entryItems.get(id) : undefined;
  const panelEl = entryList?.element;
  if (!id || !item || !panelEl) return;

  const c = map.getContainer().getBoundingClientRect();
  const p = map.latLngToContainerPoint([item.latitude, item.longitude]);
  const x = c.left + p.x;
  const y = c.top + p.y;

  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    return;
  }

  const panel = panelEl.getBoundingClientRect();
  const margin = 20;
  const covered =
    x > panel.left - margin &&
    x < panel.right + margin &&
    y > panel.top - margin &&
    y < panel.bottom + margin;

  if (covered) focusEntry(id);
}

// Zentriert einen Punkt im sichtbaren (nicht verdeckten) Kartenbereich.
// Animiert wird mit Leaflets eigenem flyTo (herauszoomen, fahren, hereinzoomen).
function centerOn(
  latlng: L.LatLngExpression,
  options: { zoom?: number; animate?: boolean } = {},
) {
  const { zoom = map.getZoom(), animate = true } = options;
  const target = L.latLng(latlng);

  const c = map.getContainer().getBoundingClientRect();
  const v = getVisibleMapRect();

  let dx = 0;
  let dy = 0;
  if (v.right - v.left > 80 && v.bottom - v.top > 80) {
    dx = (v.left + v.right) / 2 - (c.left + c.right) / 2;
    dy = (v.top + v.bottom) / 2 - (c.top + c.bottom) / 2;
  }

  const center = map.unproject(
    map.project(target, zoom).subtract([dx, dy]),
    zoom,
  );

  suppressSyncUntil = Date.now() + (animate ? 3500 : 500);

  if (!animate) {
    map.setView(center, zoom, { animate: false });
    return;
  }

  map.flyTo(center, zoom);
}

function setActiveEntry(id: string | null, scrollList = false) {
  if (id === activeEntryId) return;

  const previous = activeEntryId;
  activeEntryId = id;

  for (const entryId of [previous, id]) {
    if (!entryId) continue;
    const item = entryItems.get(entryId);
    const marker = markers.get(entryId);
    if (!item || !marker) continue;

    // Icon nur in den Optionen tauschen (gilt, wenn der Cluster den Marker neu
    // zeichnet) und am bestehenden Element die Klasse umschalten. setIcon würde
    // das Element unter dem Mauszeiger ersetzen und Hover/Tooltip stören.
    marker.options.icon = markerIcon(item);
    marker.getElement()?.classList.toggle("is-active", entryId === id);
    marker.setZIndexOffset(zIndexFor(item));
  }

  entryList?.setActive(id, scrollList);
}

function zIndexFor(item: EntryItem) {
  if (item.id === activeEntryId) return 2000;
  return item.visited ? 0 : 500;
}

// Kleinster Zoom, bei dem der Marker nicht mehr in einem Cluster steckt.
// Nutzt das interne Feld __parent von leaflet.markercluster; fehlt es, greift
// der Fallback in focusEntry.
function zoomToUncluster(marker: L.Marker) {
  const parent = (marker as any).__parent as { _zoom?: number } | undefined;
  if (typeof parent?._zoom !== "number") return 0;
  return Math.min(parent._zoom + 1, map.getMaxZoom());
}

function focusEntry(
  id: string,
  options: { zoom?: number; animate?: boolean } = {},
) {
  const item = entryItems.get(id);
  if (!item) return;

  setActiveEntry(id);
  focusedEntryId = id;

  const token = ++focusToken;
  const latlng = L.latLng(item.latitude, item.longitude);
  const marker = markers.get(id);

  // Zielzoom so wählen, dass der Marker dort nicht in einem Cluster steckt.
  const baseZoom = options.zoom ?? map.getZoom();
  const zoom = marker ? Math.max(baseZoom, zoomToUncluster(marker)) : baseZoom;

  // Fallback (z. B. Marker an exakt gleicher Position): nach dem Flug auflösen
  const reveal = () => {
    if (token !== focusToken || !marker) return;
    if (
      !markerCluster.hasLayer(marker) ||
      markerCluster.getVisibleParent(marker) === marker
    ) {
      return;
    }

    // Erst weiter hereinzoomen – mit Versatz, damit die Liste den Marker nicht
    // verdeckt. zoomToShowLayer zentriert in der Bildschirmmitte und bleibt
    // nur für Marker an identischer Position (Spiderfy) übrig.
    const unclusterZoom = zoomToUncluster(marker);
    if (unclusterZoom > map.getZoom()) {
      map.once("moveend", () => window.setTimeout(reveal, 300));
      centerOn(latlng, { zoom: unclusterZoom });
    } else {
      markerCluster.zoomToShowLayer(marker);
    }
  };

  if (options.animate === false) {
    centerOn(latlng, { zoom, animate: false });
    window.setTimeout(reveal, 300);
  } else {
    map.once("moveend", () => window.setTimeout(reveal, 300));
    centerOn(latlng, { zoom });
  }
}

function openEntry(id: string) {
  const item = entryItems.get(id);
  if (!item) return;

  if (isEditMode) {
    void showEditMenu(id, item.title);
  } else {
    showPhotoGallery(id);
    void setMarkerVisited(id);
  }
}

/* ==========================================================================
   Route
   ========================================================================== */

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

  // Zeitbasiert: die ganze Route ist nach ROUTE_ANIMATION_MS gezeichnet,
  // unabhängig von der Zahl der Abschnitte und der Bildwiederholrate.
  const segments = points.length - 1;
  const startTime = performance.now();

  function draw(now: number) {
    // Der Zeitstempel von requestAnimationFrame ist der Frame-Beginn und kann
    // vor startTime liegen – daher nach unten auf 0 begrenzen.
    const t = Math.min(Math.max((now - startTime) / ROUTE_ANIMATION_MS, 0), 1);
    const position = t * segments;
    const segmentIndex = Math.min(Math.floor(position), segments - 1);
    const progress = position - segmentIndex;

    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    const current: L.LatLngExpression[] = [
      ...points.slice(0, segmentIndex + 1),
      [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
      ],
    ];

    routeGlow.setLatLngs(current);
    routeLine.setLatLngs(current);

    routeAnimationFrame = t < 1 ? requestAnimationFrame(draw) : null;
  }

  routeAnimationFrame = requestAnimationFrame(draw);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ==========================================================================
   Marker
   ========================================================================== */

// Nummerierter, runder Marker. Die Skalierung beim Hervorheben passiert am
// inneren Badge, weil Leaflet das äußere Element per transform positioniert.
function markerIcon(item: EntryItem) {
  const state = isEditMode
    ? "is-edit editable-marker"
    : item.visited
      ? "is-visited"
      : "is-new";
  const active = item.id === activeEntryId ? " is-active" : "";

  return L.divIcon({
    className: `entry-marker ${state}${active}`,
    html: `<span class="entry-marker__badge">${pad(item.number)}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function tooltipHtml(item: EntryItem) {
  const editHint = isEditMode
    ? `<div class="tooltip-edit-hint"><i class="bi bi-pencil"></i> ${t(
        "editHint",
      )}</div>`
    : "";

  const date = new Date(item.createdAt).toLocaleDateString(
    getLanguageCode(getCurrentLanguage()),
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

  return `<div class="tooltip-inner">
      <div class="tooltip-title">
        ${pad(item.number)} · ${escapeHtml(item.title)}
      </div>
      <div class="tooltip-date">
        ${t("uploadLabel")}: ${date}
      </div>
      <div class="bi bi-images tooltip-views">
        ${item.images}
      </div>
      <div class="bi bi-people-fill tooltip-views">
        ${item.visitors}
      </div>
      ${editHint}
    </div>`;
}

function bindEntryTooltip(marker: L.Marker, item: EntryItem) {
  marker.unbindTooltip();
  marker.bindTooltip(tooltipHtml(item), {
    className: item.visited ? "visited-marker" : "unvisited-marker",
    direction: "top",
    offset: [0, -20],
  });
}

function createMarker(item: EntryItem) {
  const markerOptions: L.MarkerOptions & { entryId?: string } = {
    icon: markerIcon(item),
    entryId: item.id,
    zIndexOffset: zIndexFor(item),
    riseOnHover: true,
  };

  const marker = L.marker([item.latitude, item.longitude], markerOptions)
    .on("click", () => {
      setActiveEntry(item.id);
      openEntry(item.id);
    })
    .on("mouseover", () => {
      // Hover auf dem Marker hebt den Eintrag in der Liste hervor (und scrollt
      // ihn in den Sichtbereich); die Karte bewegt sich dabei nicht.
      if (!canHover()) return;
      setActiveEntry(item.id, true);
    });

  bindEntryTooltip(marker, item);

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

    const { error } = await supabase
      .from("entries")
      .update({ [localizedEntryColumn("title")]: newTitle })
      .eq("id", entryId);

    console.log("Update result:", error);

    if (error) {
      console.error("Error updating entry:", error);
      alert(t("errorSaving") + error.message);
    } else {
      alert(t("save"));
      closeModal();
      // Marker, Liste und Route neu laden
      await refreshMarkers();
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
          await refreshMarkers();
        }
      }
    };
  }
}

/* ==========================================================================
   Laden und Rendern
   ========================================================================== */

// Neueste Station zuerst, so wie sie in der Liste erscheint.
function syncEntryList() {
  const sorted = [...entryItems.values()].sort((a, b) => b.number - a.number);
  entryList?.setData(sorted);
}

async function loadMarkersInView() {
  if (!currentCountry) return;

  const requestId = ++activeMarkersRequestId;

  const { data, error } = await supabase
    .from("entries")
    .select(
      "id, latitude, longitude, title, description, title_es, description_es, user_id, taken_at, created_at, visited_entries(count), photos!photos_entry_id_fkey(count)",
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

  // Nummern laufen chronologisch (älteste Station = 1) und entsprechen damit
  // der Reihenfolge der Route.
  entryItems.clear();
  data.forEach((entry: any, index: number) => {
    entryItems.set(entry.id, {
      id: entry.id,
      number: index + 1,
      title: localizeEntryField(entry, "title"),
      createdAt: entry.created_at,
      latitude: entry.latitude,
      longitude: entry.longitude,
      images: entry.photos?.[0]?.count ?? 0,
      visitors: entry.visited_entries?.[0]?.count ?? 0,
      visited: visitedMarkers.has(entry.id),
    });
  });

  syncEntryList();

  // Beim Start: neueste Station hervorheben und fokussieren.
  const initialFocusId =
    pendingFocusId && entryItems.has(pendingFocusId) ? pendingFocusId : null;
  pendingFocusId = null;
  if (initialFocusId) {
    baselineEntryId = initialFocusId;
    activeEntryId = initialFocusId;
    entryList?.setActive(initialFocusId, true);
  }

  renderMarkers(requestId);

  if (initialFocusId) {
    // erst nach dem Layout der Liste zentrieren, weil deren Höhe den
    // sichtbaren Kartenbereich bestimmt
    requestAnimationFrame(() =>
      focusEntry(initialFocusId, { zoom: FOCUS_ZOOM, animate: false }),
    );
  }

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
  refreshGalleryLanguage();
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
  // programmatische Bewegungen (Fokus, Flug zum Land) nicht auswerten
  if (Date.now() < suppressSyncUntil) return;

  if (countrySyncTimer) {
    window.clearTimeout(countrySyncTimer);
  }

  countrySyncTimer = window.setTimeout(() => {
    void syncCountryFromMap();
  }, 180);
}

// Nur die Kartenmitte entscheidet über das Land. Liegt sie außerhalb aller
// Regionen (z. B. über Wasser), bleibt das aktuelle Land erhalten.
async function syncCountryFromMap() {
  if (!map || !isInitialized) return;

  const { lat, lng } = map.getCenter();
  const centerCountry = await determineSection(lat, lng);

  if (centerCountry === "Unknown" || centerCountry === currentCountry) {
    return;
  }

  selectCountry(centerCountry, { flyTo: false, syncSlider: true });
}

function renderMarkers(requestId = activeMarkersRequestId) {
  if (requestId !== activeMarkersRequestId) return;

  // Alle Marker auf einmal hinzufügen (addLayers clustert im Batch) und
  // gemeinsam in 0,2 s einblenden (.marker-pop-in in style.css).
  const added: L.Marker[] = [];
  for (const item of entryItems.values()) {
    if (markers.has(item.id)) continue;
    const marker = createMarker(item);
    markers.set(item.id, marker);
    added.push(marker);
  }
  markerCluster.addLayers(added);

  window.requestAnimationFrame(() => {
    for (const marker of added) {
      const el = marker.getElement();
      if (!el) continue;
      el.classList.add("marker-pop-in");
      el.addEventListener(
        "animationend",
        () => el.classList.remove("marker-pop-in"),
        { once: true },
      );
    }
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

type EntryOverview = {
  id: string;
  section: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Schlanke Übersicht aller Stationen, neueste zuerst.
async function loadEntryOverview(): Promise<EntryOverview[]> {
  const { data, error } = await supabase
    .from("entries")
    .select("id, section, latitude, longitude")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

// Zahlen je Land für das Länder-Dropdown: alle Stationen und unbesuchte.
function updateCountryCounts(overview: EntryOverview[]) {
  const counts = new Map<CountryCode, number>();
  const totals = new Map<CountryCode, number>();
  for (const entry of overview) {
    if (!isCountryCode(entry.section)) continue;
    totals.set(entry.section, (totals.get(entry.section) ?? 0) + 1);
    if (visitedMarkers.has(entry.id)) continue;
    counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
  }

  unvisitedCountsByCountry = counts;
  totalCountsByCountry = totals;
  syncCountryMenu();
}

async function setMarkerVisited(entryId: string) {
  const user = await getUser();
  await supabase.from("visited_entries").upsert(
    {
      user_id: user?.id,
      entry_id: entryId,
      visited_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entry_id" },
  );

  const wasVisited = visitedMarkers.has(entryId);
  visitedMarkers.add(entryId);

  // Nur beim ersten Besuch herunterzählen, sonst sinkt der Zähler bei jedem
  // erneuten Öffnen einer bereits besuchten Station.
  if (!wasVisited) {
    const remainingUnvisited = Math.max(
      0,
      (unvisitedCountsByCountry.get(currentCountry) ?? 0) - 1,
    );
    unvisitedCountsByCountry.set(currentCountry, remainingUnvisited);
    // updateUnvisitedMarkers(unvisitedCountsByCountry);
    syncCountryMenu();
  }

  const item = entryItems.get(entryId);
  if (!item || item.visited) return;

  item.visited = true;
  item.visitors += 1;

  const marker = markers.get(entryId);
  if (marker) {
    marker.setIcon(markerIcon(item));
    marker.setZIndexOffset(zIndexFor(item));
    bindEntryTooltip(marker, item);
  }

  markerCluster.refreshClusters();
  syncEntryList();
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
