// Gemeinsame Logik für alle Modals (Upload, Einladung, Eintrag bearbeiten).
//
// Solange ein Modal offen ist, wird alles dahinter mit `inert` gesperrt:
// Keine Maus-/Hover-Ereignisse (z. B. Stationsliste → Karte fährt zur
// Station), kein Tastaturfokus, kein Scrollen/Zoomen der Karte. Gesperrt
// werden alle Kinder von `.main_wrapper` außer dem Backdrop und dem
// Container der Modals selbst. Das Bearbeiten-Modal hängt direkt an <body>
// und ist daher ohnehin nicht betroffen.

const BACKGROUND_EXCLUDE = ["modal-backdrop"];
const MODAL_CONTAINER_CLASS = "modal_dialog";

function backgroundElements(): HTMLElement[] {
  const wrapper = document.querySelector<HTMLElement>(".main_wrapper");
  if (!wrapper) return [];
  return Array.from(wrapper.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !BACKGROUND_EXCLUDE.includes(el.id) &&
      !el.classList.contains(MODAL_CONTAINER_CLASS),
  );
}

/** Sperrt bzw. entsperrt den Hintergrund und blendet den Backdrop ein/aus. */
export function setBackgroundBlocked(blocked: boolean) {
  document.getElementById("modal-backdrop")?.classList.toggle("active", blocked);
  backgroundElements().forEach((el) => {
    el.inert = blocked;
  });
}

/** Setzt den Fokus auf das erste bedienbare Feld im Modal. */
export function focusFirstField(modal: HTMLElement) {
  const field = modal.querySelector<HTMLElement>(
    "input:not([type='file']), textarea, select",
  );
  field?.focus({ preventScroll: true });
}
