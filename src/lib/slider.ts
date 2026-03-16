import { selectCountry } from "./map";
import { COUNTRIES, type CountryCode } from "./geo";

// const stops = [
//   { country: "DE", label: "Deutschland" },
//   { country: "AU", label: "Australien" },
//   { country: "TAS", label: "Tasmanien" },
//   { country: "NZ", label: "Neuseeland" },
//   { country: "FJ", label: "Fiji" },
// ];
const stops = Object.entries(COUNTRIES).map(([code, data]) => ({
  country: code as CountryCode,
  label: data.name,
}));

const track = document.getElementById("navbar")! as HTMLElement;
const handle = document.querySelector(".slider-handle") as HTMLElement;
const tooltip = document.getElementById("slider-tooltip") as HTMLElement;
const progress = document.querySelector(".slider-progress") as HTMLElement;

let dragging = false;
let currentIndex = 0;
let dragPercentage = 0;

stops.forEach((stop, index) => {
  const el = document.createElement("div");

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
  // tooltip.textContent = stops[index].label;
  setActiveStop(index);
  selectCountry(stops[index].country);
}

function nearestStop(percent: number) {
  return Math.round(percent * (stops.length - 1));
}

function showTooltip() {
  tooltip.style.opacity = "1";
}

function hideTooltip() {
  tooltip.style.opacity = "0";
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

  tooltip.textContent = stops[index].label;
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

track.addEventListener("click", (e) => {
  dragPercentage = magneticPercent(getPercentFromEvent(e));
  const index = nearestStop(dragPercentage);

  snapTo(index);
});

track.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

handle.addEventListener("mousedown", () => {
  dragging = true;
  showTooltip();
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
  // const percent = getPercentFromEvent(e);
  // const index = nearestStop(dragPercentage);

  // snapTo(index);
  snapTo(nearestStop(dragPercentage));
  hideTooltip();
});

handle.addEventListener("touchstart", () => {
  dragging = true;
  showTooltip();
});

document.addEventListener("touchmove", (e) => {
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

document.addEventListener("touchend", () => {
  if (!dragging) return;

  dragging = false;
  // const percent = getPercentFromEvent(e);
  snapTo(nearestStop(dragPercentage));
  // const index = nearestStop(dragPercentage);

  // snapTo(index);
  hideTooltip();
});

document.querySelectorAll(".slider-stop").forEach((stop, i) => {
  stop.addEventListener("click", () => {
    snapTo(i);
  });
});
