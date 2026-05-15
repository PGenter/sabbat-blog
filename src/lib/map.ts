import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { supabase, getUser } from "../lib/supabase";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode } from "./geo";
// import "./slider.ts";
import "./gallery.ts";

// const editMarkerIconUrl = new URL("../../assets/marker/camera-48.png", import.meta.url).href;
// const visitedMarkerIconUrl = new URL("../../assets/marker/camera-48-visited.png", import.meta.url).href;
// const newMarkerIconUrl = new URL("../../assets/marker/camera-48-new.png", import.meta.url).href;
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
let currentCountry: CountryCode | "DE" = "DE";
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
let isEditMode = false;
let currentGalleryEntryId: string | null = null;
let currentGalleryDescription: string | null = null;

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
    opacity: 0.9,
    weight: 3,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  await loadVisitedMarkers();
  await loadUnvisitedEntryCount();

  // const latestEntry = await getLatestEntry();
  if (latestEntry?.section && latestEntry?.section != null) {
    currentCountry = latestEntry.section;
    selectCountry(latestEntry.section);
    await setCardText(latestEntry.section);
  }
  map.on("moveend", handleViewportChanged);
}

export function toggleEditMode(buttonName: string) {
  // console.log("Starte Edit-Mode");
  // console.log("Geklickter Button ist " + buttonName);
  isEditMode = !isEditMode;
  const editButton = document.getElementById(buttonName) as HTMLButtonElement;
  if (isEditMode) {
    editButton.classList.add("active");
    document.body.classList.add("edit-mode");
  } else {
    editButton.classList.remove("active");
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
    duration: 2,
  });
  // const card = document.getElementById("country-card") as HTMLDivElement;
  // card.innerHTML = `<h2>${COUNTRIES[country].name}</h2>`;
}

export async function setCardText(country: CountryCode) {
  const card = document.getElementById("country-card") as HTMLDivElement;
  const user = await getUser();
  card.innerHTML = `<h2>Hallo ${user?.user_metadata?.first_name},</h2>
  <p>schön, dass du hier bist! Auf dieser Seite kannst du uns auf unserer Reise begleiten.</p>
  <p>Die Marker auf der Karte zeigen die Stationen, die wir bislang besucht haben.</p>
  <p>Aktuell befinden wir uns in <u><b>${COUNTRIES[country].name}</b></u>.</p>`;
  if (unvisitedEntries == 0) {
    card.innerHTML += `<p>Es gibt aktuell leider keine neuen Stationen zu entdecken. Wir werden bald neue Bilder hochladen. Bis dahin kannst du unsere bisherigen Stationen noch einmal erkunden.</p>`;
  } else if(unvisitedEntries == 1) {
    card.innerHTML += `<p>Es gibt noch <u>${unvisitedEntries} Station</u>, die du noch nicht entdeckt hast. </p>`;
  } else {
    card.innerHTML += `<p>Es gibt noch <u>${unvisitedEntries} Stationen</u>, die du noch nicht entdeckt hast. </p>`;
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
  // takenAt: string,
  createdAt: string,
  // userId: string,
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
    // title:
    //   title +
    //   "</br>Upload am " +
    //   new Date(createdAt).toLocaleDateString("de-DE", {
    //     day: "2-digit",
    //     month: "2-digit",
    //     year: "numeric",
    //   }),
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
    ? `<div class="tooltip-edit-hint"><i class="bi bi-pencil"></i> Bearbeiten</div>`
    : "";

  marker.bindTooltip(
    `<div class="tooltip-inner">
      <div class="tooltip-title">
        ${title}
      </div>
     <div class="tooltip-date">
       Upload: ${new Date(createdAt).toLocaleDateString("de-DE")}
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
        <div class="card-head">
          <h2>Marker bearbeiten</h2>
          <div class="reset-link">
            <button class="close-button" id="edit-close-button">X</button>
          </div>
        </div>
        <div class="edit-container">
          <input type="text" id="edit-title" placeholder="Titel" required/>
          <button class="nav-button lg-button" id="save-edit-btn"><i class="bi bi-check"></i>Speichern</button>
          ${role === "administrator" ? '<button class="nav-button lg-button delete-btn" id="delete-entry-btn"><i class="bi bi-trash"></i>Löschen</button>' : ""}
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

    console.log("Updating entry", entryId, "with title", newTitle);

    const { error } = await supabase
      .from("entries")
      .update({ title: newTitle })
      .eq("id", entryId);

    console.log("Update result:", error);

    if (error) {
      console.error("Error updating entry:", error);
      alert("Fehler beim Speichern: " + error.message);
    } else {
      alert("Titel gespeichert");
      closeModal();
      // Reload markers to reflect changes
      clearMarkers();
      loadMarkersInView();
    }
  };

  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (
        confirm(
          "Bist du sicher, dass du diesen Eintrag löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.",
        )
      ) {
        const { error } = await supabase
          .from("entries")
          .delete()
          .eq("id", entryId);

        if (error) {
          console.error("Error deleting entry:", error);
          alert("Fehler beim Löschen");
        } else {
          alert("Eintrag gelöscht");
          closeModal();
          // Reload markers
          clearMarkers();
          loadMarkersInView();
        }
      }
    };
  }
}

function showPhotoGallery(entryId: string, description: string) {
  currentGalleryEntryId = entryId;
  currentGalleryDescription = description;
  loadPhotosOfMarker(entryId, description);
}

async function loadPhotosOfMarker(entryId: string, description: string) {
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

  await renderPhotos(data, description);
}

async function renderPhotos(photos: any[], description: string) {
  const gallery = document.getElementById("photo-gallery") as HTMLDivElement;
  const header = document.getElementById("photo-header") as HTMLDivElement;
  header.innerHTML = `<h2>${COUNTRIES[currentCountry!].name}</h2> 
                      <div class="close-button-container">
                        <button class="nav-button rnd-button glassy close-button" id="close-button"><i class="bi bi-x"></i></button>
                      </div>`;

  const closeButton = document.getElementById(
    "close-button",
  ) as HTMLButtonElement;
  closeButton.addEventListener("click", () => {
    closeGallery();
  });
  document.body.addEventListener("keydown", (event) => {
    const key = event.key;
    switch (key) {
      case "Escape":
        closeGallery();
        break;
    }
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

  const user = await getUser();
  const role = user?.app_metadata?.role || "user";
  const canEditDescription =
    isEditMode && (role === "administrator" || role === "superuser");
  const canDeletePhotos = isEditMode && role === "administrator";

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
    const takenAt = new Date(photo.taken_at).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    img.src = photo.image_url;
    img.alt = description;
    itemNo.textContent = `Bild ${index + 1} von ${total}`;
    itemTakenAt.textContent = takenAt;

    const itemDescriptionElement = canEditDescription
      ? document.createElement("textarea")
      : document.createElement("div");
    itemDescriptionElement.className = canEditDescription
      ? "item-description item-description-input"
      : "item-description";

    if (canEditDescription) {
      const textarea = itemDescriptionElement as HTMLTextAreaElement;
      textarea.value = description || "";
      textarea.placeholder = "Beschreibung bearbeiten...";
      textarea.rows = 4;
    } else {
      itemDescriptionElement.textContent = description || "";
    }

    imgContainer.classList.add("item");
    imgContainer.dataset.photoId = photo.id;
    itemImg.classList.add("item-img");
    itemContent.classList.add("item-content");
    itemNo.classList.add("item-no");
    itemTakenAt.classList.add("item-date");
    itemDescriptionElement.classList.add("item-description");

    carouselGallery.appendChild(imgContainer);
    imgContainer.appendChild(itemImg);
    imgContainer.appendChild(itemContent);
    itemImg.appendChild(img);
    itemContent.appendChild(itemNo);
    itemContent.appendChild(itemTakenAt);
    itemContent.appendChild(itemDescriptionElement);

    if (canEditDescription) {
      const saveButton = document.createElement("button");
      saveButton.className = "nav-button lg-button item-save-button";
      saveButton.innerHTML = '<i class="bi bi-check"></i> Speichern';
      saveButton.addEventListener("click", async () => {
        const newDescription = (
          itemDescriptionElement as HTMLTextAreaElement
        ).value.trim();
        if (!currentGalleryEntryId) return;

        const { error } = await supabase
          .from("entries")
          .update({ description: newDescription })
          .eq("id", currentGalleryEntryId);

        if (error) {
          console.error("Error updating description:", error);
          alert("Fehler beim Speichern der Beschreibung");
          return;
        }

        currentGalleryDescription = newDescription;
        const descriptionElements =
          document.querySelectorAll(".item-description");
        descriptionElements.forEach((element) => {
          if (element instanceof HTMLTextAreaElement) {
            element.value = newDescription;
          } else {
            element.textContent = newDescription;
          }
        });

        alert("Beschreibung gespeichert");
      });
      itemContent.appendChild(saveButton);
    }

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "image-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Bist du sicher, dass du dieses Bild löschen möchtest?"))
          return;

        const { error } = await supabase
          .from("photos")
          .delete()
          .eq("id", photo.id);

        if (error) {
          console.error("Error deleting photo:", error);
          alert("Fehler beim Löschen des Bildes");
          return;
        }

        const removedPhoto = carouselGallery.querySelector(
          `.item[data-photo-id="${photo.id}"]`,
        );
        const removedThumbnail = thumbnailGallery.querySelector(
          `.item[data-photo-id="${photo.id}"]`,
        );
        removedPhoto?.remove();
        removedThumbnail?.remove();

        if (!carouselGallery.querySelector(".item")) {
          closeGallery();
        }
      });

      itemImg.appendChild(deleteButton);
    }
  }

  function createThumbnail(photo: any) {
    const thumbItem = document.createElement("div");
    const thumbImg = document.createElement("img");
    thumbImg.src = photo.thumbnail_url;
    thumbImg.alt = description;
    thumbItem.classList.add("item");
    thumbItem.dataset.photoId = photo.id;
    thumbItem.appendChild(thumbImg);

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "thumbnail-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("Bist du sicher, dass du dieses Bild löschen möchtest?"))
          return;

        const { error } = await supabase
          .from("photos")
          .delete()
          .eq("id", photo.id);

        if (error) {
          console.error("Error deleting photo:", error);
          alert("Fehler beim Löschen des Bildes");
          return;
        }

        const removedPhoto = carouselGallery.querySelector(
          `.item[data-photo-id="${photo.id}"]`,
        );
        const removedThumbnail = thumbnailGallery.querySelector(
          `.item[data-photo-id="${photo.id}"]`,
        );
        removedPhoto?.remove();
        removedThumbnail?.remove();

        if (!carouselGallery.querySelector(".item")) {
          closeGallery();
        }
      });

      thumbItem.appendChild(deleteButton);
    }

    const thumbnailGallery = document.getElementById(
      "thumbnail-gallery",
    ) as HTMLDivElement;
    thumbnailGallery.appendChild(thumbItem);
  }

  function closeGallery() {
    const gallery = document.getElementById("photo-gallery") as HTMLDivElement;
    gallery.classList.remove("active");
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
      // entry.taken_at,
      entry.created_at,
      // entry.user_id,
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

// initMap();
