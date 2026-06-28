import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { getUser, supabase } from "../lib/supabase";
import {
  formatCountText,
  getCurrentLanguage,
  getLanguageCode,
  t,
} from "../lib/i18n.ts";
import "leaflet.markercluster";
import { COUNTRIES, type CountryCode, getCountryName } from "./geo";
import "./gallery.ts";
import { getCountryIndex, snapTo } from "./slider.ts";

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
export let isEditMode = false;
let currentGalleryEntryId: string | null = null;
let currentGalleryDescription: string | null = null;

type GalleryComment = {
  id: string;
  content: string;
  user_id: string | null;
  author_name?: string | null;
  author_email?: string | null;
  created_at: string;
};

type GalleryUser = Awaited<ReturnType<typeof getUser>>;

function getCommentAuthorName(user: GalleryUser) {
  const firstName = user?.user_metadata?.first_name?.trim() ?? "";
  const lastName = user?.user_metadata?.last_name?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return fullName || user?.email || t("anonymousUser");
}

function getCommentDisplayName(
  comment: GalleryComment,
  currentUser: GalleryUser,
) {
  if (comment.author_name) return comment.author_name;
  if (currentUser?.id && comment.user_id === currentUser.id) {
    return getCommentAuthorName(currentUser);
  }
  return comment.author_email || t("commentAuthor");
}

function formatCommentDate(value: string) {
  return new Date(value).toLocaleString(getLanguageCode(getCurrentLanguage()), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function loadCommentsForPhoto(
  entryId: string,
  commentsList: HTMLUListElement,
  emptyState: HTMLElement,
  countBadge: HTMLElement,
  currentUser: GalleryUser,
) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, user_id, author_name, author_email, created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading comments:", error);
    return;
  }

  commentsList.innerHTML = "";
  countBadge.replaceChildren();

  const commentNo = data?.length ?? 0;
  if (commentNo > 0) {
    const icon = document.createElement("i");
    icon.className =
      commentNo > 9 ? "bi bi-airplane-fill" : `bi bi-${commentNo}-circle-fill`;
    countBadge.appendChild(icon);
  }

  if (!data?.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  data.forEach((comment: GalleryComment) => {
    const item = document.createElement("li");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const tail = document.createElement("div");
    tail.className = "comment-tail";
    const author = document.createElement("strong");
    const isOwnComment =
      !!currentUser?.id && comment.user_id === currentUser.id;
    author.textContent = getCommentDisplayName(comment, currentUser);
    const seperator = document.createElement("span");
    seperator.textContent = "-";
    const date = document.createElement("span");
    date.textContent = formatCommentDate(comment.created_at);
    meta.appendChild(tail);
    tail.appendChild(author);
    tail.appendChild(seperator);
    tail.appendChild(date);

    if (isOwnComment) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "comment-delete-button";
      deleteButton.type = "button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", async () => {
        if (!confirm(t("confirmDeleteComment"))) return;
        const { error } = await supabase
          .from("comments")
          .delete()
          .eq("id", comment.id)
          .eq("user_id", currentUser.id);

        if (error) {
          console.error("Error deleting comment:", error);
          alert(t("errorDeletingComment"));
          return;
        }

        item.remove();
        await loadCommentsForPhoto(
          entryId,
          commentsList,
          emptyState,
          countBadge,
          currentUser,
        );
      });
      meta.appendChild(deleteButton);
    }

    const text = document.createElement("div");
    text.className = "comment-text";
    text.textContent = comment.content;

    item.appendChild(meta);
    item.appendChild(text);
    commentsList.appendChild(item);
  });
}

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

    console.log("Updating entry", entryId, "with title", newTitle);

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
  const galleryHeader = document.getElementById(
    "gallery-title",
  ) as HTMLDivElement;
  const editButton = document.getElementById("edit-gallery") as HTMLDivElement;
  const user = await getUser();
  const role = user?.app_metadata?.role || "user";
  const showEditButton = role === "administrator" || role === "superuser";
  const currentUser = user;

  galleryHeader.innerHTML = `<h2>${getCountryName(
    currentCountry!,
    getCurrentLanguage(),
  )}</h2>`;

  if (!showEditButton) {
    editButton.style.display = "none";
  }

  const closeButton = document.getElementById(
    "close-button",
  ) as HTMLButtonElement;
  closeButton.onclick = () => {
    if (!isEditMode) {
      closeGallery();
    }
  };
  document.body.onkeydown = (event) => {
    if (!isEditMode && event.key === "Escape") {
      closeGallery();
    }
  };

  const carouselGallery = document.getElementById(
    "carousel-gallery",
  ) as HTMLDivElement;
  const thumbnailGallery = document.getElementById(
    "thumbnail-gallery",
  ) as HTMLDivElement;
  const commentsPanel = document.getElementById(
    "comments-panel",
  ) as HTMLElement;
  const commentsToggle = document.querySelector(
    ".comment-button .comments-toggle",
  ) as HTMLButtonElement;
  const commentsCount = document.querySelector(
    ".comment-button .comments-toggle-number",
  ) as HTMLSpanElement;
  const commentsBody = commentsPanel.querySelector(
    ".comments-body",
  ) as HTMLDivElement;
  const commentsList = commentsPanel.querySelector(
    ".comments-list",
  ) as HTMLUListElement;
  const emptyState = commentsPanel.querySelector(
    ".comments-empty",
  ) as HTMLDivElement;
  const commentInput = commentsPanel.querySelector(
    ".comment-input",
  ) as HTMLTextAreaElement;
  const submitCommentButton = commentsPanel.querySelector(
    ".comments-submit",
  ) as HTMLButtonElement;
  const commentDivider = document.querySelector(
    "#photo-gallery .comment-divider",
  ) as HTMLDivElement;
  const firstPhoto = photos[0];
  const total = photos.length;
  carouselGallery.innerHTML = ""; // Clear previous photos
  thumbnailGallery.innerHTML = ""; // Clear previous thumbnails
  gallery.classList.add("active");
  commentsPanel.classList.add("collapsed");
  commentsBody.hidden = true;
  // commentsCount.textContent = "0";
  commentInput.placeholder = t("commentPlaceholder");
  // submitCommentButton.textContent = t("addComment");
  emptyState.textContent = t("noCommentsYet");

  void loadCommentsForPhoto(
    currentGalleryEntryId || firstPhoto.id,
    commentsList,
    emptyState,
    commentsCount,
    currentUser,
  );

  const clampWidth = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  commentsToggle.title = t("commentsToggle");

  commentsToggle.onclick = () => {
    const shouldOpen = commentsPanel.classList.contains("collapsed");
    commentsPanel.classList.toggle("collapsed", !shouldOpen);
    commentDivider.classList.toggle("collapsed", !shouldOpen);
    commentsBody.hidden = !shouldOpen;

    if (!shouldOpen) {
      commentsPanel.style.width = "";
      commentsPanel.style.flexBasis = "";
    }

    if (shouldOpen) {
      void loadCommentsForPhoto(
        currentGalleryEntryId || firstPhoto.id,
        commentsList,
        emptyState,
        commentsCount,
        currentUser,
      );
    }
  };

  commentDivider.onpointerdown = (event) => {
    if (commentsPanel.classList.contains("collapsed")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = commentsPanel.getBoundingClientRect().width;
    const move = (moveEvent: PointerEvent) => {
      const nextWidth = clampWidth(
        startWidth + (moveEvent.clientX - startX),
        160,
        520,
      );
      commentsPanel.style.width = `${nextWidth}px`;
      commentsPanel.style.flexBasis = `${nextWidth}px`;
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  submitCommentButton.onclick = async () => {
    const commentText = commentInput.value.trim();
    if (!commentText) return;

    if (!currentUser) {
      alert(t("loginRequiredComment"));
      return;
    }

    const { error } = await supabase.from("comments").insert({
      entry_id: currentGalleryEntryId,
      user_id: currentUser.id,
      content: commentText,
      author_name: getCommentAuthorName(currentUser),
      author_email: currentUser.email,
    });

    if (error) {
      console.error("Error saving comment:", error);
      alert(t("errorSavingComment"));
      return;
    }

    commentInput.value = "";
    commentsPanel.classList.remove("collapsed");
    commentsBody.hidden = false;
    await loadCommentsForPhoto(
      currentGalleryEntryId || firstPhoto.id,
      commentsList,
      emptyState,
      commentsCount,
      currentUser,
    );
  };

  commentInput.oninput = () => autoResizeCommentInput(commentInput);
  // autoResizeCommentInput();

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
    const itemTemplate = document.getElementById(
      "gallery-item-template",
    ) as HTMLTemplateElement;
    const imgContainer = itemTemplate.content.firstElementChild!.cloneNode(
      true,
    ) as HTMLElement;
    const img = imgContainer.querySelector("img") as HTMLImageElement;
    const itemNo = imgContainer.querySelector(".item-no") as HTMLDivElement;
    const itemDate = imgContainer.querySelector(".item-date") as HTMLDivElement;
    let itemDescription = imgContainer.querySelector(
      ".item-description",
    ) as HTMLElement;
    const itemMedia = imgContainer.querySelector(
      ".item-media",
    ) as HTMLDivElement;
    const itemImg = imgContainer.querySelector(".item-img") as HTMLDivElement;
    const itemContent = imgContainer.querySelector(
      ".item-content",
    ) as HTMLDivElement;
    const takenAt = new Date(photo.taken_at).toLocaleDateString(
      getLanguageCode(getCurrentLanguage()),
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      },
    );

    img.src = photo.image_url;
    img.alt = description;
    itemNo.textContent = `${t("photoNumber")} ${index + 1} ${t("of")} ${total}`;
    itemDate.textContent = takenAt;

    if (canEditDescription) {
      const textarea = document.createElement("textarea");
      textarea.value = description || "";
      textarea.placeholder = t("editDescriptionPlaceholder");
      textarea.rows = 4;
      textarea.className = "item-description item-description-input";
      itemContent.replaceChild(textarea, itemDescription);
      itemDescription = textarea;
    } else {
      itemDescription.textContent = description || "";
    }

    imgContainer.classList.add("item");
    imgContainer.dataset.photoId = photo.id;
    itemMedia.classList.add("item-media");
    itemImg.classList.add("item-img");
    itemContent.classList.add("item-content");
    itemNo.classList.add("item-no");
    itemDate.classList.add("item-date");
    itemDescription.classList.add("item-description");

    carouselGallery.appendChild(imgContainer);

    if (canEditDescription) {
      const saveButton = document.createElement("button");
      saveButton.className = "nav-button lg-button item-save-button";
      saveButton.innerHTML = `<i class="bi bi-check"></i> ${t("save")}`;
      saveButton.addEventListener("click", async () => {
        const newDescription = (
          itemDescription as HTMLTextAreaElement
        ).value.trim();
        if (!currentGalleryEntryId) return;

        const { error } = await supabase
          .from("entries")
          .update({ description: newDescription })
          .eq("id", currentGalleryEntryId);

        if (error) {
          console.error("Error updating description:", error);
          alert(t("errorSavingDescription"));
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

        alert(t("descriptionSaved"));
      });
      itemContent.appendChild(saveButton);
    }

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "image-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm(t("confirmDeletePhoto"))) return;

        const { error } = await supabase
          .from("photos")
          .delete()
          .eq("id", photo.id);

        if (error) {
          console.error("Error deleting photo:", error);
          alert(t("errorDeletingPhoto"));
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
    const thumbTemplate = document.getElementById(
      "thumbnail-template",
    ) as HTMLTemplateElement;
    const thumbItem = thumbTemplate.content.firstElementChild!.cloneNode(
      true,
    ) as HTMLElement;
    const thumbImg = thumbItem.querySelector("img") as HTMLImageElement;
    thumbImg.src = photo.thumbnail_url;
    thumbImg.alt = description;
    thumbItem.classList.add("item");
    thumbItem.dataset.photoId = photo.id;

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "thumbnail-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm(t("confirmDeletePhoto"))) return;

        const { error } = await supabase
          .from("photos")
          .delete()
          .eq("id", photo.id);

        if (error) {
          console.error("Error deleting photo:", error);
          alert(t("errorDeletingPhoto"));
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
    const commentsPanel = document.getElementById(
      "comments-panel",
    ) as HTMLElement;
    const commentsBody = commentsPanel.querySelector(
      ".comments-body",
    ) as HTMLDivElement;

    gallery.classList.remove("active");
    commentsPanel.classList.add("collapsed");
    commentsBody.hidden = true;
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

function autoResizeCommentInput(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
