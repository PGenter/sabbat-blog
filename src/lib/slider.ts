import { COUNTRIES, getCountryName, type CountryCode } from "./geo";
import { getCurrentLanguage } from "./i18n.ts";

const stops = Object.entries(COUNTRIES).map(([code, data]) => ({
  country: code as CountryCode,
  img: data.img,
}));

const track = document.getElementById("slider-track")! as HTMLElement;
const handle = document.querySelector(".slider-handle") as HTMLElement;
const progress = document.querySelector(".slider-progress") as HTMLElement;

let dragging = false;
let dragPercentage = 0;
let activeTooltip: HTMLElement | null = null;
let onCountryChange: ((country: CountryCode) => void) | null = null;

stops.forEach((_stop, index) => {
  const el = document.createElement("div");
  const tooltip = document.createElement("div");
  const tooltipText = document.createElement("span");
  const tooltipImg = document.createElement("img");
  const unvisitedMarker = document.createElement("span");
  tooltip.className = "slider-tooltip";
  tooltip.id = `tooltip-${_stop.country}`;
  tooltipText.textContent = getCountryName(_stop.country, getCurrentLanguage());
  tooltipText.classList.add("slider-tooltip-text");
  tooltip.appendChild(tooltipText);
  tooltipImg.src = COUNTRIES[_stop.country].img;
  tooltipImg.title = getCountryName(_stop.country, getCurrentLanguage());
  tooltip.appendChild(tooltipImg);
  el.appendChild(tooltip);

  unvisitedMarker.className = "slider-stop-marker";
  unvisitedMarker.id = `unvisited-marker-${_stop.country}`;
  tooltip.appendChild(unvisitedMarker);

  el.className = "slider-stop";
  el.style.left = `${(index / (stops.length - 1)) * 100}%`;
  track.appendChild(el);
});

// Zeigt an den Slider-Stops eine Markierung, solange für das jeweilige Land
// noch unbesuchte Stationen existieren; verschwindet automatisch, sobald die
// letzte unbesuchte Station des Landes besucht wurde.
export function updateUnvisitedMarkers(counts: Map<CountryCode, number>) {
  stops.forEach((stop) => {
    const marker = document.getElementById(`unvisited-marker-${stop.country}`);
    if (!marker) return;
    marker.classList.toggle("visible", (counts.get(stop.country) ?? 0) > 0);
  });
}

export function setOnCountryChange(callback: (country: CountryCode) => void) {
  onCountryChange = callback;
}

export function getCountryIndex(country: CountryCode): number {
  return stops.findIndex((stop) => stop.country === country);
}

export function updateCountryLabels() {
  document.querySelectorAll(".slider-tooltip").forEach((tooltip) => {
    const id = tooltip.id;
    const countryCode = id.replace("tooltip-", "") as CountryCode;
    const text = tooltip.querySelector("span") as HTMLElement | null;
    const img = tooltip.querySelector("img") as HTMLImageElement | null;
    if (text) {
      text.textContent = getCountryName(countryCode, getCurrentLanguage());
    }
    if (img) {
      img.title = getCountryName(countryCode, getCurrentLanguage());
    }
  });
}

function getPercentFromEvent(e: MouseEvent | TouchEvent) {
  const rect = track.getBoundingClientRect();
  const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
  let percent = (clientX - rect.left) / rect.width;

  percent = Math.max(0, Math.min(1, percent));

  return percent;
}

export function snapTo(index: number, notify = true) {
  const percent = index / (stops.length - 1);

  handle.style.left = `${percent * 100}%`;
  updateProgress(percent);
  setActiveStop(index);
  previewStop(percent);

  if (!window.onload) {
    // kleines haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  resetAllTooltips();
  if (notify && onCountryChange) {
    onCountryChange(stops[index].country);
  }
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

function clearTooltipState(tooltip: HTMLElement | null) {
  if (!tooltip) return;

  tooltip.style.transform = "";
  tooltip.style.backgroundColor = "";
  tooltip.style.boxShadow = "";
  tooltip.style.padding = "";
  tooltip.classList.remove("active");

  const text = tooltip.querySelector("span") as HTMLElement | null;
  text?.classList.remove("active");
}

function setTooltipActiveState(tooltip: HTMLElement | null) {
  if (!tooltip) return;

  tooltip.classList.add("active");
  const text = tooltip.querySelector("span") as HTMLElement | null;
  text?.classList.add("active");
}

function previewStop(percent: number) {
  const index = Math.round(percent * (stops.length - 1));
  const nextTooltip = document.getElementById(
    `tooltip-${stops[index].country}`,
  ) as HTMLElement | null;

  if (activeTooltip && activeTooltip !== nextTooltip) {
    clearTooltipState(activeTooltip);
  }

  activeTooltip = nextTooltip;
  setTooltipActiveState(activeTooltip);
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
    clearTooltipState(el as HTMLElement);
  });
  activeTooltip = null;
}

function updateTooltipDuringDrag(percent: number) {
  const tooltip = activeTooltip;
  const nav = document.querySelector(".nav_wrapper") as HTMLElement;

  if (!tooltip || !nav) return;

  const tooltipText = tooltip.querySelector("span") as HTMLElement | null;
  if (!tooltipText) return;

  setTooltipActiveState(tooltip);

  const navWidth = nav.clientWidth;
  const tooltipWidth = tooltip.offsetWidth;

  const desiredCenter = percent * navWidth;

  const minCenter = tooltipWidth / 2;
  const maxCenter = navWidth - tooltipWidth / 2;

  const clampedCenter = Math.min(Math.max(desiredCenter, minCenter), maxCenter);

  const offset = clampedCenter - desiredCenter;

  tooltip.style.transform = `translate(calc(-50% + ${offset}px), -150%)`;
  tooltip.style.backgroundColor = "white";
  tooltip.style.boxShadow = "0 4px 10px #0004";
  tooltip.style.padding = "6px 10px";
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
  setDraggingState(dragging);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
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
  setDraggingState(dragging);

  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  snapTo(nearestStop(dragPercentage));
});

let justTouched = false;

handle.addEventListener("touchstart", () => {
  dragging = true;
  justTouched = true;
  setDraggingState(dragging);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
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
  setDraggingState(dragging);
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  snapTo(nearestStop(dragPercentage));

  setTimeout(() => {
    justTouched = false;
  }, 300);
});

document.querySelectorAll(".slider-stop").forEach((stop, i) => {
  stop.addEventListener("click", (e) => {
    e.stopPropagation();
    snapTo(i);
  });
  
  // Hover-Events zum Anzeigen des Tooltips
  stop.addEventListener("mouseenter", () => {
    if (dragging) return;
    const tooltip = stop.querySelector(".slider-tooltip") as HTMLElement;
    if (tooltip) {
      const tooltipText = tooltip.querySelector("span") as HTMLElement;
      tooltip.classList.add("active");
      if (tooltipText) {
        tooltipText.classList.add("active");
      }
      // Transform mit -150% auf Y-Achse, wie beim Dragging
      tooltip.style.transform = "translate(-50%, -150%) scale(1)";
      tooltip.style.backgroundColor = "white";
      tooltip.style.boxShadow = "0 4px 10px #0004";
      tooltip.style.padding = "6px 10px";
    }
  });
  
  stop.addEventListener("mouseleave", () => {
    if (dragging) return;
    // Nur entfernen, wenn dieser Stop nicht aktiv/selektiert ist
    if (!stop.classList.contains("active")) {
      const tooltip = stop.querySelector(".slider-tooltip") as HTMLElement;
      if (tooltip) {
        const tooltipText = tooltip.querySelector("span") as HTMLElement;
        tooltip.classList.remove("active");
        if (tooltipText) {
          tooltipText.classList.remove("active");
        }
        tooltip.style.transform = "";
        tooltip.style.backgroundColor = "";
        tooltip.style.boxShadow = "";
        tooltip.style.padding = "";
      }
    }
  });
});
