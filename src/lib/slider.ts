import { selectCountry } from "./map";

const stops = [
  { country: "DE", label: "Deutschland" },
  { country: "AU", label: "Australien" },
  { country: "TAS", label: "Tasmanien" },
  { country: "NZ", label: "Neuseeland" },
  { country: "FJ", label: "Fiji" },
];

const track = document.querySelector(".navbar_wrapper") as HTMLElement;
const handle = document.querySelector(".slider-handle") as HTMLElement;
const tooltip = document.getElementById("slider-tooltip") as HTMLElement;

let dragging = false;
let currentIndex = 0;

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

  tooltip.style.left = `${percent * 100}%`;
  tooltip.textContent = stops[index].label;

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

track.addEventListener("click", (e) => {
  const percent = getPercentFromEvent(e);

  const index = nearestStop(percent);

  snapTo(index);
});

handle.addEventListener("mousedown", () => {
  dragging = true;
  showTooltip();
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  const percent = getPercentFromEvent(e);

  handle.style.left = `${percent * 100}%`;
  tooltip.style.left = `${percent * 100}%`;
});

document.addEventListener("mouseup", (e) => {
  if (!dragging) return;

  dragging = false;

  const percent = getPercentFromEvent(e);

  const index = nearestStop(percent);

  snapTo(index);

  hideTooltip();
});

handle.addEventListener("touchstart", () => {
  dragging = true;
  showTooltip();
});

document.addEventListener("touchmove", (e) => {
  if (!dragging) return;

  const percent = getPercentFromEvent(e);

  handle.style.left = `${percent * 100}%`;
  tooltip.style.left = `${percent * 100}%`;
});

document.addEventListener("touchend", (e) => {
  if (!dragging) return;

  dragging = false;

  const percent = getPercentFromEvent(e);

  const index = nearestStop(percent);

  snapTo(index);

  hideTooltip();
});

document.querySelectorAll(".slider-stop").forEach((stop, i) => {

  stop.addEventListener("click", () => {
    snapTo(i);
  });

});