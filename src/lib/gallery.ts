import { getCountryName } from "./geo";
import { t, getLanguageCode, getCurrentLanguage } from "./i18n";
import { currentCountry, isEditMode } from "./map";
import Split from "split.js";
import { getUser, supabase } from "./supabase";
import { orientation } from "exifr";

let timeRunning = 500;
let runTimeOut: NodeJS.Timeout;
let nextDom = document.getElementById("next");
let prevDom = document.getElementById("prev");
let carouselDom = document.querySelector(".gallery-container");
let listItemDom = document.querySelector(
  ".gallery-container .carousel-gallery",
);
let thumbnailDom = document.querySelector(
  ".gallery-container .thumbnail-gallery",
);
let gallerySplit: any = null;
export let currentGalleryEntryId: string | null = null;
export let currentGalleryDescription: string | null = null;

type GalleryComment = {
  id: string;
  content: string;
  user_id: string | null;
  author_name?: string | null;
  author_email?: string | null;
  created_at: string;
};

type GalleryUser = Awaited<ReturnType<typeof getUser>>;
// type LayoutState = { comments: number };

nextDom!.onclick = () => {
  showSlider("next");
};
prevDom!.onclick = () => {
  showSlider("prev");
};

document.body.addEventListener("keydown", (event) => {
  const key = event.key;
  if (!isEditMode) {
    switch (key) {
      case "ArrowLeft":
        showSlider("prev");
        break;
      case "ArrowRight":
        showSlider("next");
        break;
    }
  }
});

function showSlider(type: string) {
  let itemSlider = document.querySelectorAll(
    ".gallery-container .carousel-gallery .item",
  );
  let itemThumbnail = document.querySelectorAll(
    ".gallery-container .thumbnail-gallery .item",
  );

  if (type === "next") {
    if (itemSlider.length > 0) {
      listItemDom?.appendChild(itemSlider[0]);
    }
    if (itemThumbnail.length > 0) {
      thumbnailDom?.appendChild(itemThumbnail[0]);
    }
    carouselDom?.classList.add("next");
  } else {
    let positionLastItem = itemSlider.length - 1;
    listItemDom?.prepend(itemSlider[positionLastItem]);
    thumbnailDom?.prepend(itemThumbnail[positionLastItem]);
    carouselDom?.classList.add("prev");
  }

  clearTimeout(runTimeOut);
  runTimeOut = setTimeout(() => {
    carouselDom?.classList.remove("next");
    carouselDom?.classList.remove("prev");
  }, timeRunning);
}

// Touch / swipe support for small touch devices
let touchStartX = 0;
let touchCurrentX = 0;
const touchThreshold = 50; // px

if (carouselDom) {
  carouselDom.addEventListener(
    "touchstart",
    (e) => {
      const touchEvent = e as TouchEvent;
      if (!touchEvent.touches || touchEvent.touches.length === 0) return;
      touchStartX = touchEvent.touches[0].clientX;
      touchCurrentX = touchStartX;
    },
    { passive: true },
  );

  carouselDom.addEventListener(
    "touchmove",
    (e) => {
      const touchEvent = e as TouchEvent;
      if (!touchEvent.touches || touchEvent.touches.length === 0) return;
      touchCurrentX = touchEvent.touches[0].clientX;
    },
    { passive: true },
  );

  carouselDom.addEventListener(
    "touchend",
    () => {
      const dx = touchCurrentX - touchStartX;
      if (Math.abs(dx) > touchThreshold) {
        if (dx < 0) {
          showSlider("next");
        } else {
          showSlider("prev");
        }
      }
      touchStartX = 0;
      touchCurrentX = 0;
    },
    { passive: true },
  );

  carouselDom.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const itemImg = target.closest(".item-img") as HTMLElement | null;
    if (itemImg) {
      carouselDom.classList.toggle("hide-controls");
    }
  });
}

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

function destroyGallerySplit() {
  gallerySplit?.destroy?.();
  gallerySplit = null;
}

function getIsMobile() {
  return window.innerWidth < 1024;
}

// function applyLayout(state: LayoutState) {
//   const isMobile = getIsMobile();

//   if (isMobile) {
//     // inverted visual order durch column-reverse
//     gallerySplit.setSizes([state.comments, 100 - state.comments]);
//   } else {
//     gallerySplit.setSizes([state.comments, 100 - state.comments]);
//   }
// }

function initGallerySplit(initialOpenSize = 0) {
  if (gallerySplit) return;

  const commentsShell = document.getElementById("comments-shell");
  const galleryShell = document.getElementById("gallery-shell");
  if (!commentsShell || !galleryShell) return;

  const isMobile = getIsMobile();
  const direction = isMobile ? "vertical" : "horizontal";
  const minSize = isMobile ? [0, 0] : [0, 0];
  const maxSize = isMobile ? [calculatePixel(0.5, 'height'), Infinity] : [600, Infinity]
  const sizes = [initialOpenSize, 100 - initialOpenSize];
  const snapOffset = isMobile ? 40 : 80;
  const gutterSize = isMobile ? 10 : 12;

  gallerySplit = Split(["#comments-shell", "#gallery-shell"], {
    sizes,
    minSize,
    maxSize,
    gutterSize,
    cursor: isMobile ? "row-resize" : "col-resize",
    direction,
    snapOffset,
  });
  // if(isMobile) {
  //   gallerySplit.setSizes(0, 200);
  // }
}

function updateGallerySplitForViewport() {
  const gallery = document.getElementById("photo-gallery");
  if (!gallery?.classList.contains("active")) {
    destroyGallerySplit();
    return;
  }

  destroyGallerySplit();
  requestAnimationFrame(() => {
    initGallerySplit();
  });
}

function calculatePixel(percentage: number, orientation: string) {
  let maxValue = 0;
  if(orientation === 'height'){
    maxValue = window.innerHeight;
  }
  if(orientation === 'width'){
    maxValue = window.innerWidth;
  }
  return maxValue * percentage;
}

function animateComments(targetComments: number, duration = 350) {
  if (!gallerySplit) return;

  const isMobile = getIsMobile();
  const [start] = gallerySplit.getSizes();

  const startTime = performance.now();

  function frame(now: number) {
    const t = Math.min((now - startTime) / duration, 1);

    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    let value = start + (targetComments - start) * eased;

    if (isMobile) {
      value = 100 - value;
    }

    gallerySplit.setSizes([value, 100 - value]);

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function setCommentsPanelState(isCollapsed: boolean) {
  if (document.getElementById("photo-gallery")?.classList.contains("active")) {
    requestAnimationFrame(() => {
      if (!gallerySplit) return;

      const isMobile = getIsMobile();

      const targetComments = !isCollapsed ? 0 : isMobile ? 40 : 20;
      console.log("targetComments = " + targetComments);
      animateComments(targetComments);
    });
  }
}

window.addEventListener("resize", updateGallerySplitForViewport);

export function showPhotoGallery(entryId: string, description: string) {
  currentGalleryEntryId = entryId;
  currentGalleryDescription = description;
  loadPhotosOfMarker(entryId, description);
}

export async function loadPhotosOfMarker(entryId: string, description: string) {
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
  const firstPhoto = photos[0];
  const total = photos.length;
  carouselGallery.innerHTML = ""; // Clear previous photos
  thumbnailGallery.innerHTML = ""; // Clear previous thumbnails
  gallery.classList.add("active");
  requestAnimationFrame(() => {
    initGallerySplit(0);
    setCommentsPanelState(false);
  });
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

  commentsToggle.title = t("commentsToggle");

  commentsToggle.onclick = () => {
    // const shouldOpen = commentsPanel.classList.contains("collapsed");
    let isCommentOpen = gallerySplit.getSizes()[0] >= 2;
    console.log("Kommentarbereich geöffnet? " + isCommentOpen);
    setCommentsPanelState(!isCommentOpen);

    if (isCommentOpen) {
      void loadCommentsForPhoto(
        currentGalleryEntryId || firstPhoto.id,
        commentsList,
        emptyState,
        commentsCount,
        currentUser,
      );
    }
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
    setCommentsPanelState(false);
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

    gallery.classList.remove("active");
    setCommentsPanelState(true);
  }
}

function autoResizeCommentInput(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
