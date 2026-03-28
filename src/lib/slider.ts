import { selectCountry } from "./map";
import { COUNTRIES, type CountryCode } from "./geo";

const stops = Object.entries(COUNTRIES).map(([code, data]) => ({
  country: code as CountryCode,
  label: data.name,
  img: data.img,
}));

const track = document.getElementById("slider-track")! as HTMLElement;
const handle = document.querySelector(".slider-handle") as HTMLElement;
// const tooltip = document.getElementById("slider-tooltip") as HTMLElement;
const progress = document.querySelector(".slider-progress") as HTMLElement;

let dragging = false;
// let isDragging = false;
let currentIndex = 0;
let dragPercentage = 0;

stops.forEach((_stop, index) => {
  const el = document.createElement("div");
  const tooltip = document.createElement("div");
  const tooltipText = document.createElement("span");
  const tooltipImg = document.createElement("img");
  tooltip.className = "slider-tooltip";
  tooltip.id = `tooltip-${_stop.country}`;
  tooltipText.textContent = _stop.label;
  tooltip.appendChild(tooltipText);
  tooltipImg.src = COUNTRIES[_stop.country].img;
  tooltip.appendChild(tooltipImg);
  el.appendChild(tooltip);

  el.className = "slider-stop";
  el.style.left = `${(index / (stops.length - 1)) * 100}%`;
  track.appendChild(el);
});

function getPercentFromEvent(e: MouseEvent | TouchEvent) {
  const rect = track.getBoundingClientRect();
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
  let percent = (clientX - rect.left) / rect.width;

  percent = Math.max(0, Math.min(1, percent));

  return percent;
}

function snapTo(index: number) {
  currentIndex = index;

  const percent = index / (stops.length - 1);

  handle.style.left = `${percent * 100}%`;
  updateProgress(percent);
  setActiveStop(index);
  previewStop(percent);

  // kleines haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }

  resetAllTooltips();
  selectCountry(stops[index].country);

  requestAnimationFrame(() => {
    clampActiveTooltip(index);
  });
}

function nearestStop(percent: number) {
  return Math.round(percent * (stops.length - 1));
}

function updateSlider(percent: number) {
  handle.style.left = `${percent * 100}%`;
  progress.style.width = `${percent * 100}%`;
}

function updateProgress(percent: number) {
  progress.style.width = `${percent * 100}%`;
}

function previewStop(percent: number) {
  const index = Math.round(percent * (stops.length - 1));
  document
    .querySelectorAll(".slider-tooltip")
    .forEach((stop) => stop.classList.remove("active"));
  document
    .getElementById(`tooltip-${stops[index].country}`)
    ?.classList.add("active");
}

function setActiveStop(index: number) {
  document
    .querySelectorAll(".slider-stop")
    .forEach((stop) => stop.classList.remove("active"));

  document.querySelectorAll(".slider-stop")[index].classList.add("active");
}

function magneticPercent(percent: number) {
  const step = 1 / (stops.length - 1);
  const index = Math.round(percent / step);
  const stopPercent = index * step;
  const distance = percent - stopPercent;
  const magnetRange = step * 0.25;

  if (Math.abs(distance) < magnetRange) {
    return percent - distance * 0.5;
  }

  return percent;
}

function resetAllTooltips() {
  document.querySelectorAll(".slider-tooltip").forEach((el) => {
    (el as HTMLElement).style.transform = "";
  });
}

function clampActiveTooltip(index: number) {
  const tooltip = document.querySelector(
    ".slider-tooltip.active",
  ) as HTMLElement;

  const nav = document.querySelector(".nav_wrapper") as HTMLElement;
  const navbar = document.querySelector(".navbar_wrapper") as HTMLElement;

  if (!tooltip || !nav) return;

  const navWidth = nav.clientWidth;
  const navbarWidth = navbar.clientWidth;
  const tooltipWidth = tooltip.offsetWidth;

  // console.log("navWidth:", navWidth, "tooltipWidth:", tooltipWidth);

  const percent = index / (stops.length - 1);
  // console.log("index:", index, "percent:", percent);

  const desiredCenter = percent * navWidth;

  const minCenter = tooltipWidth / 2 + (navbarWidth - navWidth) / 2;
  const maxCenter = navWidth - tooltipWidth / 2 - (navbarWidth - navWidth) / 2;
  // console.log("desiredCenter:", desiredCenter, "minCenter:", minCenter, "maxCenter:", maxCenter);

  const clampedCenter = Math.min(Math.max(desiredCenter, minCenter), maxCenter);

  const offset = clampedCenter - desiredCenter;

  tooltip.style.transform = `translate(calc(-50% + ${offset}px), -150%)`;
}

function updateTooltipDuringDrag(percent: number) {
  const tooltip = document.querySelector(
    ".slider-tooltip.active",
  ) as HTMLElement;

  const nav = document.querySelector(".nav_wrapper") as HTMLElement;

  if (!tooltip || !nav) return;

  const navWidth = nav.clientWidth;
  const tooltipWidth = tooltip.offsetWidth;

  const desiredCenter = percent * navWidth;

  const minCenter = tooltipWidth / 2;
  const maxCenter = navWidth - tooltipWidth / 2;

  const clampedCenter = Math.min(Math.max(desiredCenter, minCenter), maxCenter);

  const offset = clampedCenter - desiredCenter;

  tooltip.style.transform = `translate(calc(-50% + ${offset}px), -150%)`;
}

function setDraggingState(state: boolean) {
  document.body.classList.toggle("dragging", state);
}

track.addEventListener("click", (e: MouseEvent) => {
  // verhindert Klick während Drag
  if (dragging || justTouched) return;

  let percent = getPercentFromEvent(e);
  percent = magneticPercent(percent);

  dragPercentage = percent;

  updateSlider(percent);

  const index = nearestStop(percent);
  snapTo(index); // Snap + Map wechseln
});

window.onload = () => {
  snapTo(0);
};

window.addEventListener("resize", () => clampActiveTooltip(currentIndex));

// track.addEventListener("mousemove", (e: MouseEvent) => {
//   if (dragging) return;
//   const rect = track.getBoundingClientRect();
//   const x = e.clientX - rect.left;

//   tooltip.style.left = `${x}px`;

//   const percent = x / rect.width;
//   previewStop(percent);
//   showTooltip();
// });

// track.addEventListener("mouseleave", () => {
//   if (!dragging) hideTooltip();
// });

track.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

handle.addEventListener("mousedown", () => {
  dragging = true;
  // isDragging = true;
  setDraggingState(dragging);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
  // showTooltip(dragPercentage);
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  let percent = getPercentFromEvent(e);
  percent = magneticPercent(percent);
  dragPercentage = percent;

  updateSlider(percent);
  previewStop(percent);

  updateTooltipDuringDrag(percent);
});

document.addEventListener("mouseup", () => {
  if (!dragging) return;

  dragging = false;
  // isDragging = false;
  setDraggingState(dragging);

  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  // const percent = getPercentFromEvent(e);
  // const index = nearestStop(dragPercentage);

  // snapTo(index);
  snapTo(nearestStop(dragPercentage));
  // hideTooltip(dragPercentage);
});

let justTouched = false;

handle.addEventListener("touchstart", () => {
  dragging = true;
  // isDragging = true;
  justTouched = true;
  setDraggingState(dragging);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
  // showTooltip(dragPercentage);
});

document.addEventListener("touchmove", (e) => {
  if (!dragging) return;

  let percent = getPercentFromEvent(e);
  percent = magneticPercent(percent);
  dragPercentage = percent;

  updateSlider(percent);

  previewStop(percent);
  updateTooltipDuringDrag(percent);
});

document.addEventListener("touchend", () => {
  justTouched = true;
  if (!dragging) return;

  dragging = false;
  // isDragging = false;
  setDraggingState(dragging);
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  // const percent = getPercentFromEvent(e);
  snapTo(nearestStop(dragPercentage));

  setTimeout(() => {
    justTouched = false;
  }, 300);
  // const index = nearestStop(dragPercentage);

  // snapTo(index);
  // hideTooltip();
});

document.querySelectorAll(".slider-stop").forEach((stop, i) => {
  stop.addEventListener("click", (e) => {
    e.stopPropagation();
    snapTo(i);
  });
});
