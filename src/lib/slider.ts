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
  // tooltip.textContent = _stop.label;
  el.appendChild(tooltip);
  // img.src = COUNTRIES[_stop.country].img;
  // img.alt = _stop.label;
  // el.appendChild(img);

  el.className = "slider-stop";
  el.style.left = `${(index / (stops.length - 1)) * 100}%`;
  // el.style.backgroundImage = `url(${COUNTRIES[_stop.country].img})`;
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
  // tooltip.textContent = stops[index].label;
  setActiveStop(index);
  previewStop(percent);
  // tooltip.textContent = stops[index].label;

  // kleines haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }

  selectCountry(stops[index].country);
}

function nearestStop(percent: number) {
  return Math.round(percent * (stops.length - 1));
}

// function showTooltip(percent: number) {
//   const index = Math.round(percent * (stops.length - 1));
//   document.getElementById(`tooltip-${stops[index].country}`)?.classList.add("active");
//   // tooltip.style.opacity = "1";
// }

// function hideTooltip(percent: number) {
//   const index = Math.round(percent * (stops.length - 1));
//   document.getElementById(`tooltip-${stops[index].country}`)?.classList.remove("active");
//   // tooltip.style.opacity = "0";
// }

function updateSlider(percent: number) {
  handle.style.left = `${percent * 100}%`;
  progress.style.width = `${percent * 100}%`;
  // tooltip.style.left = `${percent * 100}%`;
}

function updateProgress(percent: number) {
  progress.style.width = `${percent * 100}%`;
}

function previewStop(percent: number) {
  const index = Math.round(percent * (stops.length - 1));
  document.querySelectorAll(".slider-tooltip").forEach((stop) => stop.classList.remove("active"));
  document.getElementById(`tooltip-${stops[index].country}`)?.classList.add("active");

  // tooltip.textContent = stops[index].label;
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

track.addEventListener("click", (e: MouseEvent) => {
  // verhindert Klick während Drag
  if (dragging) return;

  let percent = getPercentFromEvent(e);
  percent = magneticPercent(percent);

  dragPercentage = percent;

  updateSlider(percent);     // Handle + Progress sofort bewegen
  // previewStop(percent);      // Tooltip aktualisieren

  const index = nearestStop(percent);
  snapTo(index);             // Snap + Map wechseln
});

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
  // dragPercentage = magneticPercent(getPercentFromEvent(e));

  // // handle.style.left = `${percent * 100}%`;
  // // tooltip.style.left = `${percent * 100}%`;
  // updateProgress(dragPercentage);
  // previewStop(dragPercentage);
});

document.addEventListener("mouseup", () => {
  if (!dragging) return;
  
  dragging = false;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  // const percent = getPercentFromEvent(e);
  // const index = nearestStop(dragPercentage);

  // snapTo(index);
  snapTo(nearestStop(dragPercentage));
  // hideTooltip(dragPercentage);
});

handle.addEventListener("touchstart", () => {
  dragging = true;
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
  // previewStop(percent);
  // dragPercentage = magneticPercent(getPercentFromEvent(e));

  // // handle.style.left = `${percent * 100}%`;
  // // tooltip.style.left = `${percent * 100}%`;
  // updateProgress(dragPercentage);
  // previewStop(dragPercentage);
});

document.addEventListener("touchend", () => {
  if (!dragging) return;
  
  dragging = false;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  // const percent = getPercentFromEvent(e);
  snapTo(nearestStop(dragPercentage));
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
