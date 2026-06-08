let nextDom = document.getElementById("next");
let prevDom = document.getElementById("prev");
let carouselDom = document.querySelector(".gallery-container");
let listItemDom = document.querySelector(
  ".gallery-container .carousel-gallery",
);
let thumbnailDom = document.querySelector(
  ".gallery-container .thumbnail-gallery",
);

nextDom!.onclick = () => {
  showSlider("next");
};
prevDom!.onclick = () => {
  showSlider("prev");
};

document.body.addEventListener("keydown", (event) => {
  const key = event.key;
  switch (key) {
    case "ArrowLeft":
      showSlider("prev");
      break;
    case "ArrowRight":
      showSlider("next");
      break;
  }
});

let timeRunning = 500;
let runTimeOut: NodeJS.Timeout;
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
