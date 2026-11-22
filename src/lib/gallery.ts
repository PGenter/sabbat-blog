import { getCountryName } from "./geo";
import {
  t,
  getLanguageCode,
  getCurrentLanguage,
  localizeEntryField,
  localizedEntryColumn,
} from "./i18n";
import {
  adjustEntryLikes,
  currentCountry,
  isEditMode,
  refreshNewCommentCounts,
} from "./map";
import { getUser, supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
import Swiper from "swiper";
import { Navigation, Pagination, Thumbs, Zoom } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";
// import "swiper/css/effect-coverflow";

export let currentGalleryEntryId: string | null = null;
export let currentGalleryTitle: string | null = null;
export let currentGalleryDescription: string | null = null;
let isImageFullscreen = false;

let currentGalleryPhotoId: string | null = null;
let activeCommentElements: CommentActionElements | null = null;
let activeCommentUser: Awaited<ReturnType<typeof getUser>> = null;
let activeCommentIsAdmin = false;
let swiper: Swiper | null = null;
let thumbsSwiper: Swiper | null = null;

// Likes der Fotos der aktuell geöffneten Galerie (photo_id -> Zustand)
type PhotoLikeState = { count: number; liked: boolean; pending: boolean };
const photoLikes = new Map<string, PhotoLikeState>();

type GalleryComment = {
  id: string;
  content: string;
  user_id: string | null;
  author_name?: string | null;
  author_email?: string | null;
  created_at: string;
};

type GalleryUser = Awaited<ReturnType<typeof getUser>>;

type CommentActionElements = {
  commentsList: HTMLUListElement;
  emptyState: HTMLDivElement;
  // countBadge: HTMLSpanElement;
  commentInput: HTMLTextAreaElement;
  submitCommentButton: HTMLButtonElement;
  commentsToggle: HTMLButtonElement;
};
// type LayoutState = { comments: number };

// nextDom!.onclick = () => swiper?.slideNext();
// prevDom!.onclick = () => swiper?.slidePrev();

document.body.addEventListener("keydown", (event) => {
  const key = event.key;
  if (!isEditMode && swiper) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']"))
      return;

    switch (key) {
      case "ArrowLeft":
        swiper.slidePrev();
        // showSlider("prev");
        break;
      case "ArrowRight":
        swiper.slideNext();
        // showSlider("next");
        break;
    }
  }
});

function toggleImageFullscreen(force?: boolean) {
  const gallery = document.getElementById("photo-gallery");
  if (!gallery) return;

  swiper?.zoom?.out();
  isImageFullscreen = force ?? !isImageFullscreen;
  gallery.classList.toggle("image-fullscreen", isImageFullscreen);
  updateLikeButtonInsets();
}

/* ==========================================================================
   Likes
   ========================================================================== */

function getLikeState(photoId: string): PhotoLikeState {
  let state = photoLikes.get(photoId);
  if (!state) {
    state = { count: 0, liked: false, pending: false };
    photoLikes.set(photoId, state);
  }
  return state;
}

async function loadLikesForPhotos(photoIds: string[], userId: string | null) {
  photoLikes.clear();
  photoIds.forEach((id) => getLikeState(id));
  if (photoIds.length === 0) return;

  const { data, error } = await supabase
    .from("photo_likes")
    .select("photo_id, user_id")
    .in("photo_id", photoIds);

  if (error) {
    console.error("Error loading likes:", error);
    return;
  }

  data?.forEach((like: { photo_id: string; user_id: string }) => {
    const state = getLikeState(String(like.photo_id));
    state.count += 1;
    if (userId && like.user_id === userId) state.liked = true;
  });
}

function createLikeButton(photoId: string) {
  const button = document.createElement("button");
  button.type = "button";
  // swiper-no-swiping: ein Tipp aufs Herz startet kein Wischen
  button.className = "photo-like-button swiper-no-swiping";
  button.dataset.photoId = photoId;

  const icon = document.createElement("i");
  icon.setAttribute("aria-hidden", "true");
  const count = document.createElement("span");
  count.className = "photo-like-count";
  button.append(icon, count);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void togglePhotoLike(photoId);
  });

  renderLikeButton(button);
  return button;
}

function renderLikeButton(button: HTMLButtonElement) {
  const state = getLikeState(button.dataset.photoId!);
  const icon = button.querySelector("i")!;
  const count = button.querySelector(".photo-like-count")!;
  const label = state.liked ? t("unlikePhoto") : t("likePhoto");

  button.classList.toggle("is-liked", state.liked);
  button.setAttribute("aria-pressed", String(state.liked));
  button.setAttribute("aria-label", `${label} (${state.count} ${t("likesCount")})`);
  button.title = label;
  icon.className = `bi ${state.liked ? "bi-heart-fill" : "bi-heart"}`;
  count.textContent = state.count > 0 ? String(state.count) : "";
}

function renderLikeButtons(photoId: string) {
  document
    .querySelectorAll<HTMLButtonElement>(
      `.photo-like-button[data-photo-id="${photoId}"]`,
    )
    .forEach(renderLikeButton);
}

async function togglePhotoLike(photoId: string) {
  const user = await getUser();
  if (!user) {
    alert(t("loginRequiredLike"));
    return;
  }

  const state = getLikeState(photoId);
  if (state.pending) return;

  const entryId = currentGalleryEntryId;
  const wasLiked = state.liked;
  const delta = wasLiked ? -1 : 1;

  // sofort anzeigen, bei einem Fehler zurücknehmen
  state.pending = true;
  state.liked = !wasLiked;
  state.count = Math.max(0, state.count + delta);
  renderLikeButtons(photoId);
  if (entryId) adjustEntryLikes(entryId, delta);

  const { error } = wasLiked
    ? await supabase
        .from("photo_likes")
        .delete()
        .eq("photo_id", photoId)
        .eq("user_id", user.id)
    : await supabase
        .from("photo_likes")
        .insert({ photo_id: photoId, user_id: user.id });

  state.pending = false;

  if (error) {
    console.error("Error saving like:", error);
    state.liked = wasLiked;
    state.count = Math.max(0, state.count - delta);
    renderLikeButtons(photoId);
    if (entryId) adjustEntryLikes(entryId, -delta);
    alert(t("errorLike"));
  }
}

// Im Vollbild wird das Foto mit object-fit: contain eingepasst. Damit das Herz
// trotzdem unten rechts IM Bild sitzt (und nicht im schwarzen Rand), wird der
// Abstand des sichtbaren Bilds zum Slide-Rand als CSS-Variable gesetzt.
// In der normalen Galerie füllt das Bild den Slide (cover), dort bleibt 0.
// Die Breite kommt vom Swiper-Container (ein Slide pro Ansicht): Swiper passt
// die Slide-Breiten erst verzögert an, der Container stimmt dagegen sofort.
function updateLikeButtonInsets() {
  const container = document.querySelector<HTMLElement>(".my-swiper");
  document
    .querySelectorAll<HTMLElement>(".my-swiper .swiper-slide")
    .forEach((slide) => {
      const img = slide.querySelector("img");
      let insetX = 0;
      let insetY = 0;

      if (isImageFullscreen && img?.naturalWidth && img.naturalHeight) {
        const width = container?.clientWidth ?? slide.clientWidth;
        const height = slide.clientHeight;
        const scale = Math.min(
          width / img.naturalWidth,
          height / img.naturalHeight,
        );
        insetX = Math.max(0, (width - img.naturalWidth * scale) / 2);
        insetY = Math.max(0, (height - img.naturalHeight * scale) / 2);
      }

      slide.style.setProperty("--like-inset-x", `${insetX}px`);
      slide.style.setProperty("--like-inset-y", `${insetY}px`);
    });
}


// Setzt die Bildquelle und fängt Ladefehler (z.B. abgelaufene/fehlende
// signierte URL) ab, damit statt des rohen alt-Texts eine dezente
// Platzhalter-Markierung statt des Fotos erscheint.
function bindPhotoImage(
  img: HTMLImageElement,
  brokenStateContainer: HTMLElement,
  src: string | null,
  photoId: string,
) {
  if (!src) {
    console.warn(`No usable image URL for photo ${photoId}`);
    brokenStateContainer.classList.add("item-img-broken");
    return;
  }

  img.decoding = "async";
  img.addEventListener(
    "error",
    () => {
      console.warn(
        `Gallery image failed to load for photo ${photoId}:`,
        img.src,
      );
      brokenStateContainer.classList.add("item-img-broken");
    },
    { once: true },
  );

  img.src = src;
}

// Nur das aktuell sichtbare Karussell-Bild und einige Nachbarn (per
// DOM-Reihenfolge vorne bzw. hinten) tatsächlich laden.
// const CAROUSEL_PRELOAD_AHEAD = 4;
// const CAROUSEL_PRELOAD_BEHIND = 2;

// function loadCarouselWindow() {
//   const load = (item: HTMLElement | undefined) => {
//     const img = item?.querySelector("img") as HTMLImageElement | null;
//     if (img?.dataset.src) {
//       img.src = img.dataset.src;
//       delete img.dataset.src;
//     }
//   };

//   const loadWindow = (items: NodeListOf<HTMLElement>) => {
//     if (items.length === 0) return;

//     const ahead = Math.min(CAROUSEL_PRELOAD_AHEAD, items.length);
//     for (let i = 0; i < ahead; i++) load(items[i]);

//     const behind = Math.min(CAROUSEL_PRELOAD_BEHIND, items.length - ahead);
//     for (let i = 0; i < behind; i++) load(items[items.length - 1 - i]);
//   };

//   loadWindow(
//     document.querySelectorAll<HTMLElement>(
//       ".gallery-container .carousel-gallery .item",
//     ),
//   );
//   if (!getIsMobile()) {
//     loadWindow(
//       document.querySelectorAll<HTMLElement>(
//         ".gallery-container .thumbnail-gallery .item",
//       ),
//     );
//   }
// }

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

function canEditComment(comment: GalleryComment, currentUser: GalleryUser) {
  if (!currentUser) return false;
  return (
    activeCommentIsAdmin ||
    (!!currentUser?.id && comment.user_id === currentUser.id)
  );
}

function getActivePhotoIdFromGallery() {
  const activeSlide = swiper?.slides[swiper.activeIndex] as
    | HTMLElement
    | undefined;
  return activeSlide?.dataset.photoId ?? currentGalleryPhotoId ?? null;
  // const activeItem = document.querySelector(
  //   ".gallery-container .carousel-gallery .item[data-photo-id]",
  // ) as HTMLElement | null;

  // return activeItem?.dataset.photoId ?? currentGalleryPhotoId ?? null;
}

async function refreshCommentsForActivePhoto() {
  const photoId = getActivePhotoIdFromGallery();
  if (!photoId || !activeCommentElements) return;

  currentGalleryPhotoId = photoId;
  await loadCommentsForPhoto(
    photoId,
    activeCommentElements.commentsList,
    activeCommentElements.emptyState,
    // activeCommentElements.countBadge,
    activeCommentUser,
  );
}

async function loadCommentsForPhoto(
  photoId: string,
  commentsList: HTMLUListElement,
  emptyState: HTMLElement,
  // countBadge: HTMLElement,
  currentUser: GalleryUser,
) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, user_id, author_name, author_email, created_at")
    .eq("photo_id", photoId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading comments:", error);
    return;
  }

  commentsList.innerHTML = "";
  // countBadge.replaceChildren();

  const commentNo = data?.length ?? 0;
  if (commentNo > 0) {
    const icon = document.createElement("i");
    icon.className =
      commentNo > 9 ? "bi bi-airplane-fill" : `bi bi-${commentNo}-circle-fill`;
    // countBadge.appendChild(icon);
  }

  if (!data?.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  // Administratoren/Superuser: angezeigte Kommentare gelten als gelesen
  if (activeCommentIsAdmin && currentUser) {
    void markCommentsRead(data, currentUser.id);
  }

  data.forEach((comment: GalleryComment) => {
    const item = document.createElement("li");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const tail = document.createElement("div");
    tail.className = "comment-tail";
    const author = document.createElement("strong");
    const isEditable = canEditComment(comment, currentUser);
    author.textContent = getCommentDisplayName(comment, currentUser);
    const seperator = document.createElement("span");
    seperator.textContent = "-";
    const date = document.createElement("span");
    date.textContent = formatCommentDate(comment.created_at);
    meta.appendChild(tail);
    tail.appendChild(author);
    tail.appendChild(seperator);
    tail.appendChild(date);

    const contentContainer = document.createElement("div");
    contentContainer.className = "comment-content";
    const text = document.createElement("div");
    text.className = "comment-text";
    text.textContent = comment.content;
    contentContainer.appendChild(text);

    let editableInput: HTMLInputElement | null = null;

    if (isEditable) {
      editableInput = renderEditComment(
        item,
        editableInput,
        comment,
        currentUser,
        text,
        contentContainer,
        meta,
      );
    }

    item.appendChild(meta);
    item.appendChild(contentContainer);
    commentsList.appendChild(item);
  });
}

// Bereits in dieser Sitzung als gelesen gespeicherte Kommentare (spart
// wiederholte Anfragen beim Hin- und Herblättern)
const commentsMarkedRead = new Set<string>();

async function markCommentsRead(comments: GalleryComment[], userId: string) {
  const unread = comments.filter(
    (comment) =>
      comment.user_id !== userId && !commentsMarkedRead.has(String(comment.id)),
  );
  if (unread.length === 0) return;

  const { error } = await supabase.from("comment_reads").upsert(
    unread.map((comment) => ({ comment_id: comment.id, user_id: userId })),
    { onConflict: "comment_id,user_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Error marking comments as read:", error);
    return;
  }

  unread.forEach((comment) => commentsMarkedRead.add(String(comment.id)));
  await refreshNewCommentCounts();
}

function renderEditComment(
  item: HTMLLIElement,
  editableInput: HTMLInputElement | null,
  comment: GalleryComment,
  currentUser: User | null,
  text: HTMLDivElement,
  contentContainer: HTMLDivElement,
  meta: HTMLDivElement,
) {
  const actionGroup = document.createElement("div");
  actionGroup.className = "comment-actions";
  const actionMenu = document.createElement("button");
  actionMenu.className = "comment-button comment-menu-button";
  actionMenu.type = "button";
  actionMenu.innerHTML = '<i class="bi bi-three-dots-vertical"></i>';
  actionMenu.setAttribute("aria-label", t("commentsActions"));
  actionMenu.title = t("commentsActions");
  const commentMenu = document.createElement("div");
  commentMenu.id = "comment-menu";
  commentMenu.className = "comment-menu";
  commentMenu.popover = "auto";
  actionMenu.popoverTargetElement = commentMenu;
  actionMenu.popoverTargetAction = "toggle";
  const commentMenuShell = document.createElement("div");
  commentMenuShell.className = "comment-menu-shell";

  const resetCommentEditingState = () => {
    item.dataset.editing = "false";
    editableInput?.remove();
    editableInput = null;
    text.hidden = false;
    cancelButton.hidden = true;
    deleteButton.hidden = false;
    editButton.innerHTML =
      '<i class="bi bi-pencil-square"></i> ' + t("editHint");
  };

  commentMenu.addEventListener("toggle", () => {
    if (!commentMenu.matches(":popover-open")) {
      resetCommentEditingState();
    }
  });

  const editButton = document.createElement("button");
  editButton.className = "comment-button comment-edit-button";
  editButton.type = "button";
  editButton.innerHTML = '<i class="bi bi-pencil-square"></i> ' + t("editHint");
  editButton.addEventListener("click", async () => {
    const isEditing = item.dataset.editing === "true";
    if (isEditing) {
      const nextValue = editableInput?.value.trim();
      if (!nextValue) return;

      let updateQuery = supabase
        .from("comments")
        .update({ content: nextValue })
        .eq("id", comment.id);

      if (!activeCommentIsAdmin && currentUser?.id) {
        updateQuery = updateQuery.eq("user_id", currentUser.id);
      }

      const { error } = await updateQuery;
      if (error) {
        console.error("Error updating comment:", error);
        alert(t("errorEditingComment"));
        return;
      }

      text.textContent = nextValue;
      resetCommentEditingState();
      return;
    }

    item.dataset.editing = "true";
    editableInput = document.createElement("input");
    editableInput.className = "comment-edit-input";
    editableInput.type = "text";
    editableInput.value = text.textContent ?? "";
    contentContainer.insertBefore(editableInput, text);
    text.hidden = true;
    editButton.innerHTML = '<i class="bi bi-check"></i> ' + t("save");
    deleteButton.hidden = true;
    cancelButton.hidden = false;
    editableInput.focus();
  });

  const cancelButton = document.createElement("button");
  cancelButton.className = "comment-button comment-cancel-button";
  cancelButton.type = "button";
  cancelButton.innerHTML = '<i class="bi bi-x"></i> ' + t("cancel");
  cancelButton.hidden = true;
  cancelButton.addEventListener("click", () => {
    resetCommentEditingState();
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "comment-button comment-delete-button";
  deleteButton.type = "button";
  deleteButton.innerHTML = '<i class="bi bi-trash"></i> ' + t("delete");
  deleteButton.addEventListener("click", async () => {
    if (!confirm(t("confirmDeleteComment"))) return;
    let deleteQuery = supabase.from("comments").delete().eq("id", comment.id);
    if (!activeCommentIsAdmin && currentUser?.id) {
      deleteQuery = deleteQuery.eq("user_id", currentUser.id);
    }

    const { error } = await deleteQuery;
    if (error) {
      console.error("Error deleting comment:", error);
      alert(t("errorDeletingComment"));
      return;
    }

    item.remove();
    await refreshCommentsForActivePhoto();
  });

  actionGroup.appendChild(commentMenu);
  commentMenu.appendChild(commentMenuShell);
  commentMenuShell.appendChild(editButton);
  commentMenuShell.appendChild(deleteButton);
  commentMenuShell.appendChild(cancelButton);
  meta.appendChild(actionGroup);
  meta.appendChild(actionMenu);
  return editableInput;
}


export function showPhotoGallery(entryId: string) {
  currentGalleryEntryId = entryId;
  void loadPhotosOfMarker(entryId);
}

// Bei einem Sprachwechsel die bereits geöffnete Galerie mit den Texten der
// neuen Sprache neu laden.
export function refreshGalleryLanguage() {
  const gallery = document.getElementById("photo-gallery");
  if (gallery?.classList.contains("active") && currentGalleryEntryId) {
    void loadPhotosOfMarker(currentGalleryEntryId);
  }
}

// Lange Gültigkeit, damit dieselbe signierte URL über mehrere Sitzungen hinweg
// wiederverwendet werden kann. Nur bei stabiler URL (gleicher Token) greifen
// Browser-Cache und Supabase Smart-CDN - sonst ist jeder Aufruf ein neuer
// Download (kein "cached egress").
const SIGNED_URL_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 Tage
const SIGNED_URL_CACHE_KEY = "travel-images-signed-urls-v1";
// So lange vor Ablauf wird bereits neu signiert, damit keine URL "kurz vor
// Toresschluss" an ein <img> gehängt wird.
const SIGNED_URL_RENEW_MARGIN_MS = 24 * 60 * 60 * 1000; // 1 Tag

type SignedUrlCacheEntry = { url: string; expiresAt: number };
type SignedUrlCache = Record<string, SignedUrlCacheEntry>;

function readSignedUrlCache(): SignedUrlCache {
  try {
    const raw = localStorage.getItem(SIGNED_URL_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SignedUrlCache) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSignedUrlCache(cache: SignedUrlCache) {
  try {
    localStorage.setItem(SIGNED_URL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // z.B. Speicher-Quota voll - der Cache ist nur eine Optimierung.
  }
}

// image_url/thumbnail_url speichern seit Umstellung auf einen privaten Bucket
// nur noch die Storage-Pfade; hier werden daraus zeitlich befristete URLs.
// Vor der Umstellung angelegte Zeilen enthalten noch vollständige (alte)
// Public-URLs statt eines Storage-Pfads - die lassen sich nicht signieren
// und werden deshalb unverändert weitergereicht statt an createSignedUrls
// geschickt zu werden (was dort immer "object does not exist" ergäbe).
function isStoragePath(value: unknown): value is string {
  return (
    typeof value === "string" && value !== "" && !/^https?:\/\//i.test(value)
  );
}

async function withSignedPhotoUrls(photos: any[]): Promise<any[]> {
  const paths = Array.from(
    new Set(
      photos
        .flatMap((photo) => [photo.image_url, photo.thumbnail_url])
        .filter(isStoragePath),
    ),
  );

  if (paths.length === 0) return photos;

  const now = Date.now();
  const cache = readSignedUrlCache();
  const signedUrlByPath = new Map<string, string>();
  const missingPaths: string[] = [];

  // Bereits vorhandene, noch ausreichend lange gültige URLs wiederverwenden.
  for (const path of paths) {
    const cached = cache[path];
    if (cached && cached.expiresAt - SIGNED_URL_RENEW_MARGIN_MS > now) {
      signedUrlByPath.set(path, cached.url);
    } else {
      missingPaths.push(path);
    }
  }

  if (missingPaths.length > 0) {
    const { data, error } = await supabase.storage
      .from("travel-images")
      .createSignedUrls(missingPaths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      console.error("Error creating signed URLs:", error);
    } else {
      const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1000;
      for (const entry of data) {
        if (entry.error || !entry.signedUrl || !entry.path) {
          console.warn(
            `Could not create signed URL for storage path "${entry.path}":`,
            entry.error,
          );
          continue;
        }
        signedUrlByPath.set(entry.path, entry.signedUrl);
        cache[entry.path] = { url: entry.signedUrl, expiresAt };
      }

      // Abgelaufene Einträge aufräumen, damit der Cache nicht unbegrenzt wächst.
      for (const key of Object.keys(cache)) {
        if (cache[key].expiresAt <= now) delete cache[key];
      }
      writeSignedUrlCache(cache);
    }
  }

  const resolve = (value: unknown) => {
    if (!isStoragePath(value)) return value ?? null; // bereits vollständige URL (Legacy) oder leer
    // Ohne gültige signierte URL ist ein Storage-Pfad in einem privaten
    // Bucket nicht ladbar - lieber explizit null statt eines <img src>,
    // das garantiert fehlschlägt (siehe createPhoto/createThumbnail
    // Fallback-UI).
    return signedUrlByPath.get(value) ?? null;
  };

  return photos.map((photo) => ({
    ...photo,
    image_url: resolve(photo.image_url),
    thumbnail_url: resolve(photo.thumbnail_url),
  }));
}

export async function loadPhotosOfMarker(entryId: string) {
  if (!entryId) return;

  // Titel/Beschreibung werden hier frisch geladen, damit die Galerie beim
  // Sprachwechsel ohne Reload auf die passende Sprache umschalten kann.
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .select("title, description, title_es, description_es, created_at")
    .eq("id", entryId)
    .single();

  if (entryError) {
    console.error(entryError);
  }

  const title = localizeEntryField(entry, "title");
  const description = localizeEntryField(entry, "description");
  const date = new Date(entry!.created_at).toLocaleDateString(
    getLanguageCode(getCurrentLanguage()),
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
  currentGalleryTitle = title;
  currentGalleryDescription = description;

  setGalleryFields(
    getCountryName(currentCountry!, getCurrentLanguage()),
    title,
    description,
    date,
  );

  const { data, error } = await supabase
    .from("photos")
    .select("id, user_id, taken_at, created_at, image_url, thumbnail_url")
    .eq("entry_id", entryId)
    .order("taken_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  const photos = await withSignedPhotoUrls(data);
  const user = await getUser();
  await loadLikesForPhotos(
    photos.map((photo) => String(photo.id)),
    user?.id ?? null,
  );

  await renderPhotos(photos, description);
}

async function renderPhotos(photos: any[], description: string) {
  const swiper = ensureSwiper();
  if (!swiper) return;

  const gallery = document.getElementById("photo-gallery") as HTMLDivElement;
  // const galleryHeader = document.getElementById(
  //   "gallery-title",
  // ) as HTMLDivElement;
  const editButton = document.getElementById("edit-gallery") as HTMLDivElement;
  const user = await getUser();
  const role = user?.app_metadata?.role || "user";
  const showEditButton = role === "administrator" || role === "superuser";
  const currentUser = user;

  // galleryHeader.innerHTML = `<h2>${getCountryName(
  //   currentCountry!,
  //   getCurrentLanguage(),
  // )}</h2>`;

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
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        target.blur(); // erster Esc verlässt nur das Feld
        return;
      }

      if (isImageFullscreen) {
        toggleImageFullscreen(false);
      } else {
        closeGallery();
      }
    }
  };

  // const carouselGallery = document.getElementById(
  //   "carousel-gallery",
  // ) as HTMLDivElement;
  const thumbnailGallery = document.getElementById(
    "thumbnail-gallery",
  ) as HTMLDivElement;
  const commentsPanel = document.getElementById(
    "comments-panel",
  ) as HTMLElement;
  const commentsHeader = document.getElementById(
    "comments-toggle-label",
  ) as HTMLDivElement;
  const commentsToggle = document.querySelector(
    ".comment-button .comments-toggle",
  ) as HTMLButtonElement;
  // const commentsCount = document.querySelector(
  //   ".comment-button .comments-toggle-number",
  // ) as HTMLSpanElement;
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

  // const itemDate = document.getElementById("item-date") as HTMLDivElement;
  // let itemDescription = document.getElementById("item-description") as HTMLTextAreaElement;

  thumbnailGallery.innerHTML = ""; // Clear previous thumbnails
  // carouselGallery.innerHTML = ""; // Clear previous photos
  const swiperWrapper = document.getElementById("swiper-wrapper");
  if (swiperWrapper) swiperWrapper.innerHTML = "";

  const firstPhoto = photos[0];
  // const total = photos.length;
  gallery.classList.add("active");
  commentsHeader.innerHTML = t("comments");
  commentInput.placeholder = t("commentPlaceholder");
  // submitCommentButton.textContent = t("addComment");
  emptyState.textContent = t("noCommentsYet");

  activeCommentElements = {
    commentsList,
    emptyState,
    // countBadge: commentsCount,
    commentInput,
    submitCommentButton,
    commentsToggle,
  };
  activeCommentUser = currentUser;
  activeCommentIsAdmin =
    !!user && (role === "administrator" || role === "superuser");
  currentGalleryPhotoId = firstPhoto.id;

  // commentsToggle.title = t("commentsToggle");

  // commentsToggle.onclick = () => {
  //   let isCommentOpen = gallerySplit.getSizes()[0] >= 2;
  //   setCommentsPanelState(!isCommentOpen);

  //   if (isCommentOpen) {
  //     void refreshCommentsForActivePhoto();
  //   }
  // };

  submitCommentButton.onclick = async () => {
    const commentText = commentInput.value.trim();
    if (!commentText) return;

    if (!currentUser) {
      alert(t("loginRequiredComment"));
      return;
    }

    const activePhotoId = getActivePhotoIdFromGallery();
    if (!activePhotoId) {
      alert(t("errorSavingComment"));
      return;
    }

    const { error } = await supabase.from("comments").insert({
      photo_id: activePhotoId,
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
    await refreshCommentsForActivePhoto();
  };

  commentInput.oninput = () => autoResizeCommentInput(commentInput);
  // autoResizeCommentInput();

  const canEditDescription =
    isEditMode && (role === "administrator" || role === "superuser");
  const canDeletePhotos = isEditMode && role === "administrator";

  setupDescriptionEditing(description, canEditDescription);

  // const skipThumbnails = getIsMobile();

  // photos.forEach((photo) => {
  //   createPhoto(photo);
  //   if (!skipThumbnails) createThumbnail(photo);
  // });

  photos.forEach((photo) => {
    createPhoto(photo);
    createThumbnail(photo);
  });

  swiper.update();
  thumbsSwiper?.update();
  swiper.slideTo(0, 0);
  void refreshCommentsForActivePhoto();
  updateItemNo();

  // Erst jetzt (alle .item im DOM) die Bildquellen für das sichtbare Fenster
  // setzen; der Rest folgt beim Durchblättern.
  // loadCarouselWindow();

  function createPhoto(photo: any) {
    const swiperWrapper = document.getElementById("swiper-wrapper");
    const swiperSlide = document.createElement("div");
    swiperSlide.className = "swiper-slide";
    swiperSlide.dataset.photoId = photo.id;

    const swiperSlideImg = document.createElement("img");
    swiperSlideImg.loading = "lazy";
    bindPhotoImage(swiperSlideImg, swiperSlide, photo.image_url, photo.id);

    // swiperSlide.appendChild(swiperSlideImg);
    // swiperWrapper?.appendChild(swiperSlide);

    const zoomContainer = document.createElement("div");
    zoomContainer.className = "swiper-zoom-container";
    zoomContainer.appendChild(swiperSlideImg);
    swiperSlide.appendChild(zoomContainer);
    swiperSlide.appendChild(createLikeButton(String(photo.id)));
    swiperSlideImg.addEventListener("load", () => {
      if (isImageFullscreen) updateLikeButtonInsets();
    });
    swiperWrapper?.appendChild(swiperSlide);

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "image-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void deletePhotoAndRefresh(photo.id);
      });
      swiperSlide.appendChild(deleteButton);
    }
  }

  function createThumbnail(photo: any) {
    const thumbItem = document.createElement("div");
    thumbItem.className = "swiper-slide item";
    thumbItem.dataset.photoId = photo.id;

    const thumbImg = document.createElement("img");
    thumbImg.loading = "lazy";
    thumbImg.alt = "";
    bindPhotoImage(thumbImg, thumbItem, photo.thumbnail_url, photo.id);
    thumbItem.appendChild(thumbImg);

    if (canDeletePhotos) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "thumbnail-delete-button";
      deleteButton.innerHTML = '<i class="bi bi-trash"></i>';
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void deletePhotoAndRefresh(photo.id);
      });
      thumbItem.appendChild(deleteButton);
    }

    thumbnailGallery.appendChild(thumbItem);
  }

  function closeGallery() {
    const gallery = document.getElementById("photo-gallery") as HTMLDivElement;

    toggleImageFullscreen(false);
    gallery.classList.remove("active");

    // Foto-/Thumbnail-Elemente entfernen. Sonst bleibt u.a. ein (leeres)
    // .item-content/.item-description mit pointer-events:auto über der Karte
    // liegen und blockiert dort die Interaktion, obwohl die Galerie
    // geschlossen (und unsichtbar) ist.
    // const carousel = document.getElementById("carousel-gallery");
    const thumbnails = document.getElementById("thumbnail-gallery");
    // if (carousel) carousel.innerHTML = "";
    if (thumbnails) thumbnails.innerHTML = "";

    const swiperWrapper = document.getElementById("swiper-wrapper");
    if (swiperWrapper) swiperWrapper.innerHTML = "";
  }

  async function deletePhotoAndRefresh(photoId: string) {
    if (!confirm(t("confirmDeletePhoto"))) return;

    const { error } = await supabase.from("photos").delete().eq("id", photoId);
    if (error) {
      console.error("Error deleting photo:", error);
      alert(t("errorDeletingPhoto"));
      return;
    }

    document
      .getElementById("swiper-wrapper")
      ?.querySelector(`.swiper-slide[data-photo-id="${photoId}"]`)
      ?.remove();
    thumbnailGallery
      .querySelector(`.item[data-photo-id="${photoId}"]`)
      ?.remove();

    swiper?.update();
    thumbsSwiper?.update();

    if (
      !document.getElementById("swiper-wrapper")?.querySelector(".swiper-slide")
    ) {
      closeGallery();
    }
  }
}

function autoResizeCommentInput(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
function setGalleryFields(
  country: string,
  title: string,
  description: string,
  date: string,
) {
  const galleryCountry = document.getElementById(
    "gallery-country",
  ) as HTMLDivElement;
  const galleryTitle = document.getElementById(
    "gallery-title",
  ) as HTMLDivElement;
  const itemDescription = document.getElementById(
    "item-description",
  ) as HTMLDivElement;
  const itemDate = document.getElementById("item-date") as HTMLDivElement;

  galleryCountry.textContent = country;
  galleryTitle.textContent = title;
  itemDescription.textContent = description;
  itemDate.textContent = date;
}

function ensureSwiper() {
  if (swiper) return swiper;

  const container = document.querySelector(".my-swiper");
  if (!container) {
    console.error("Swiper-Container .my-swiper nicht im DOM gefunden");
    return null;
  }

  const thumbsContainer = document.querySelector(".thumbs-swiper");
  if (thumbsContainer) {
    // thumbsSwiper = new Swiper(".thumbs-swiper", {
    //   slidesPerView: "auto",
    //   spaceBetween: 10,
    //   freeMode: true,
    //   watchSlidesProgress: true,
    // });
    thumbsSwiper = new Swiper(".thumbs-swiper", {
      slidesPerView: 4,
      spaceBetween: 8,
      watchSlidesProgress: true,
      breakpoints: {
        480: { slidesPerView: 5 },
        640: { slidesPerView: 6 },
        768: { slidesPerView: 7 },
        // ab hier Desktop-Layout: die Bildspalte ist schmaler
        1024: { slidesPerView: 5, spaceBetween: 10 },
        1280: { slidesPerView: 7 },
        1440: { slidesPerView: 8 },
        1920: { slidesPerView: 10 },
      },
    });
  }

  swiper = new Swiper(".my-swiper", {
    modules: [Navigation, Pagination, Thumbs, Zoom],
    zoom: { maxRatio: 3, toggle: false },
    slidesPerView: 1,
    spaceBetween: 12,
    grabCursor: true,
    navigation: {
      nextEl: ".my-swiper .swiper-button-next",
      prevEl: ".my-swiper .swiper-button-prev",
    },
    pagination: {
      el: ".my-swiper .swiper-pagination",
      type: "bullets",
      clickable: true,
    },
    thumbs: thumbsSwiper ? { swiper: thumbsSwiper } : undefined,
  });

  swiper.on("click", (_swiperInstance, event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".image-delete-button, .photo-like-button")) return;
    if (swiper && swiper.zoom.scale > 1) return;
    toggleImageFullscreen();
  });

  swiper.on("slideChange", () => {
    void refreshCommentsForActivePhoto();
    updateItemNo();
  });

  // Größenänderung (Fenster, Drehen, Vollbild): Herz neu im Foto platzieren
  swiper.on("resize", () => {
    if (isImageFullscreen) updateLikeButtonInsets();
  });

  return swiper;
}

function updateItemNo() {
  const itemNo = document.getElementById("item-no") as HTMLDivElement | null;
  if (!itemNo || !swiper) return;
  itemNo.textContent = `${t("photoNumber")} ${swiper.activeIndex + 1} ${t("of")} ${swiper.slides.length}`;
}

function setupDescriptionEditing(
  description: string,
  canEditDescription: boolean,
) {
  document.getElementById("item-description-save")?.remove();

  let field = document.querySelector(
    "#gallery-description .item-description",
  ) as HTMLElement | null;
  if (!field) return;

  if (canEditDescription) {
    if (field.tagName !== "TEXTAREA") {
      const textarea = document.createElement("textarea");
      textarea.id = "item-description";
      textarea.className = "item-description item-description-input";
      textarea.rows = 4;
      textarea.placeholder = t("editDescriptionPlaceholder");
      field.replaceWith(textarea);
      field = textarea;
    }
    (field as HTMLTextAreaElement).value = description || "";

    const saveButton = document.createElement("button");
    saveButton.id = "item-description-save";
    saveButton.className = "nav-button lg-button item-save-button";
    saveButton.innerHTML = `<i class="bi bi-check"></i> ${t("save")}`;
    saveButton.addEventListener("click", async () => {
      const newDescription = (field as HTMLTextAreaElement).value.trim();
      if (!currentGalleryEntryId) return;

      const { error } = await supabase
        .from("entries")
        .update({ [localizedEntryColumn("description")]: newDescription })
        .eq("id", currentGalleryEntryId);

      if (error) {
        console.error("Error updating description:", error);
        alert(t("errorSavingDescription"));
        return;
      }

      currentGalleryDescription = newDescription;
      alert(t("descriptionSaved"));
    });
    field.insertAdjacentElement("afterend", saveButton);
  } else {
    if (field.tagName === "TEXTAREA") {
      const div = document.createElement("div");
      div.id = "item-description";
      div.className = "item-description";
      field.replaceWith(div);
      field = div;
    }
    field.textContent = description || "";
  }
}
