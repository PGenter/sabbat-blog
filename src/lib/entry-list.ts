import { getCurrentLanguage, getLanguageCode, t, tCount } from "./i18n";

export type EntryListItem = {
  id: string;
  /** laufende Nummer im Land, älteste Station = 1 (entspricht der Route) */
  number: number;
  title: string;
  createdAt: string;
  images: number;
  visitors: number;
  /** Summe aller Likes auf den Fotos dieses Eintrags */
  likes: number;
  visited: boolean;
};

export type EntryListCountry = {
  code: string;
  name: string;
  flagUrl?: string;
  /** Anzahl aller Stationen in diesem Land */
  total: number;
  /** Anzahl noch unbesuchter Stationen in diesem Land */
  newCount: number;
};

export type EntryListCallbacks = {
  /** Eintrag per Hover oder Tastaturfokus gewählt (id) bzw. verlassen (null) */
  onPreview: (id: string | null) => void;
  /** Eintrag angeklickt bzw. per Enter ausgewählt */
  onSelect: (id: string) => void;
  /** Panel wurde ein- oder ausgeklappt (nach Ende der Animation) */
  onToggle: () => void;
  /** Land im Auswahlfeld gewählt */
  onCountrySelect: (code: string) => void;
};

type Filter = "all" | "new" | "visited";

// Texte der Liste stehen zentral in i18n.ts (Schlüssel "entryList…").
const FILTER_LABEL = {
  all: "entryListFilterAll",
  new: "entryListFilterNew",
  visited: "entryListFilterVisited",
} as const;

function entriesText(count: number) {
  return tCount("entryListEntriesOne", "entryListEntriesMany", count);
}

function buildStat(icon: string, value: number, label: string) {
  const el = document.createElement("span");
  el.className = "entry-item__stat";
  el.title = `${label}: ${value}`;

  const i = document.createElement("i");
  i.className = `bi ${icon}`;
  i.setAttribute("aria-hidden", "true");

  const v = document.createElement("span");
  v.textContent = String(value);

  el.append(i, v);
  return el;
}

function buildItem(item: EntryListItem, locale: string) {
  const li = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = `entry-item ${item.visited ? "is-visited" : "is-new"}`;
  button.dataset.id = item.id;

  const badge = document.createElement("span");
  badge.className = "entry-item__badge";
  badge.textContent = String(item.number).padStart(2, "0");

  const main = document.createElement("span");
  main.className = "entry-item__main";

  const title = document.createElement("span");
  title.className = "entry-item__title";
  title.textContent = item.title;

  const date = document.createElement("span");
  date.className = "entry-item__date";
  date.textContent = `${new Date(
    item.createdAt,
  ).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  main.append(title, date);

  const side = document.createElement("span");
  side.className = "entry-item__side";

  const status = document.createElement("span");
  status.className = item.visited
    ? "entry-item__status"
    : "entry-item__status entry-item__status--new";
  status.textContent = item.visited ? "" : t("entryListStatusNew");

  const stats = document.createElement("span");
  stats.className = "entry-item__stats";
  stats.append(
    buildStat("bi-images", item.images, t("entryListImages")),
    buildStat("bi-people-fill", item.visitors, t("entryListVisitors")),
    buildStat("bi-heart-fill", item.likes, t("entryListLikes")),
  );

  side.append(status, stats);
  button.append(badge, main, side);
  li.append(button);
  return li;
}

export function createEntryList(callbacks: EntryListCallbacks) {
  const panel = document.getElementById("entry-panel") as HTMLElement;
  const head = panel.querySelector(".entry-panel__head") as HTMLElement;
  const header = document.getElementById(
    "entry-panel-header",
  ) as HTMLButtonElement;
  const collapse = document.getElementById(
    "entry-panel-collapse",
  ) as HTMLButtonElement;
  const flagImg = panel.querySelector(
    ".entry-panel__flag img",
  ) as HTMLImageElement;
  const flagFallback = panel.querySelector(
    ".entry-panel__flag i",
  ) as HTMLElement;
  const menu = document.getElementById(
    "entry-country-menu",
  ) as HTMLUListElement;
  const eyebrow = document.getElementById("entry-panel-eyebrow") as HTMLElement;
  const countryEl = document.getElementById(
    "entry-panel-country",
  ) as HTMLElement;
  const countEl = document.getElementById("entry-panel-count") as HTMLElement;
  const sortEl = document.getElementById("entry-panel-sort") as HTMLElement;
  const listEl = document.getElementById("entry-list") as HTMLUListElement;
  const inner = panel.querySelector(".entry-panel__inner") as HTMLElement;
  const tabButtons = Array.from(
    panel.querySelectorAll<HTMLButtonElement>(".entry-tab"),
  );

  let items: EntryListItem[] = [];
  let countries: EntryListCountry[] = [];
  let selectedCode = "";
  let country = "";
  let filter: Filter = "all";
  let activeId: string | null = null;
  let previewId: string | null = null;
  let menuOpen = false;
  let toggleTimer: number | undefined;

  const isOpen = () => panel.classList.contains("is-open");

  /* ---------- Kopf: Beschriftung und ARIA je nach Layout ---------- */

  function syncHeader() {

    header.title = t("entryListSelectCountry");
    header.setAttribute("aria-haspopup", "listbox");
    header.setAttribute("aria-controls", menu.id);
    header.setAttribute("aria-expanded", String(menuOpen));

    collapse.title = t("entryListToggle");
    collapse.setAttribute("aria-expanded", String(isOpen()));
  }

  function applyFlag(url?: string | null) {
    flagImg.hidden = !url;
    flagFallback.hidden = !!url;
    if (url) flagImg.src = url;
  }

  /* ---------- Länderauswahl ---------- */

  function optionButtons() {
    return Array.from(
      menu.querySelectorAll<HTMLButtonElement>(".entry-country"),
    );
  }

  function focusSelectedOption() {
    const options = optionButtons();
    const selected = options.find(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    (selected ?? options[0])?.focus();
  }

  function setMenuOpen(open: boolean, focusOption = false) {
    menuOpen = open;
    menu.hidden = !menuOpen;
    panel.classList.toggle("is-menu-open", menuOpen);
    syncHeader();
    if (menuOpen && focusOption) focusSelectedOption();
  }

  function renderMenu() {
    menu.replaceChildren();

    countries.forEach((item) => {
      const li = document.createElement("li");
      li.setAttribute("role", "presentation");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "entry-country";
      button.dataset.code = item.code;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(item.code === selectedCode));

      if (item.flagUrl) {
        const flag = document.createElement("img");
        flag.className = "entry-country__flag";
        flag.src = item.flagUrl;
        flag.alt = "";
        flag.width = 28;
        flag.height = 21;
        // flag.loading = "lazy";
        button.append(flag);
      }

      const name = document.createElement("span");
      name.className = "entry-country__name";
      name.textContent = item.name;
      button.append(name);

      const total = document.createElement("span");
      total.className = "entry-country__total";
      total.textContent = entriesText(item.total);
      button.append(total);

      if (item.newCount > 0) {
        const badge = document.createElement("span");
        badge.className = "entry-country__new";
        // nur Hinweis „neu“, keine Anzahl
        badge.textContent = t("entryListHasNew");
        badge.title = t("entryListHasNewTitle");
        button.append(badge);
      }

      li.append(button);
      menu.append(li);
    });
  }

  /* ---------- Liste ---------- */

  function applyActive(scrollIntoView = false) {
    listEl.querySelectorAll<HTMLElement>(".entry-item").forEach((el) => {
      const isActive = !!activeId && el.dataset.id === activeId;
      el.classList.toggle("is-active", isActive);
      if (isActive) {
        el.setAttribute("aria-current", "true");
      } else {
        el.removeAttribute("aria-current");
      }

      if (isActive && scrollIntoView) {
        // nur innerhalb der Liste scrollen, nicht die ganze Seite
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (top < listEl.scrollTop) {
          listEl.scrollTop = top;
        } else if (bottom > listEl.scrollTop + listEl.clientHeight) {
          listEl.scrollTop = bottom - listEl.clientHeight;
        }
      }
    });
  }

  function render() {
    const locale = getLanguageCode(getCurrentLanguage());

    eyebrow.textContent = t("entryListCountry");
    countryEl.textContent = country;
    syncHeader();

    const total = items.length;
    const newCount = items.filter((item) => !item.visited).length;
    const counts: Record<Filter, number> = {
      all: total,
      new: newCount,
      visited: total - newCount,
    };

    tabButtons.forEach((button) => {
      const key = button.dataset.filter as Filter;
      button.textContent = `${t(FILTER_LABEL[key])} · ${counts[key]}`;
      button.setAttribute("aria-selected", String(key === filter));
    });

    countEl.textContent = country
      ? `${entriesText(total)} · ${country}`
      : entriesText(total);
    sortEl.textContent = t("entryListNewest");

    const visible = items.filter((item) =>
      filter === "all" ? true : filter === "new" ? !item.visited : item.visited,
    );

    const scrollTop = listEl.scrollTop;
    listEl.replaceChildren();

    if (visible.length === 0) {
      const empty = document.createElement("li");
      empty.className = "entry-list__empty";
      empty.textContent = t("entryListEmpty");
      listEl.append(empty);
    } else {
      visible.forEach((item) => listEl.append(buildItem(item, locale)));
    }

    listEl.scrollTop = scrollTop;
    applyActive();
  }

  function setOpen(open: boolean, notify = true) {
    panel.classList.toggle("is-open", open);
    inner.toggleAttribute("inert", !open);
    if (!open && menuOpen) setMenuOpen(false);
    syncHeader();

    window.clearTimeout(toggleTimer);
    if (notify) {
      // etwas länger als die CSS-Animation (0.3s)
      toggleTimer = window.setTimeout(callbacks.onToggle, 340);
    }
  }

  function idFromEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    return target?.closest<HTMLElement>(".entry-item")?.dataset.id ?? null;
  }

  function preview(id: string | null) {
    if (id === previewId) return;
    previewId = id;
    callbacks.onPreview(id);
  }

  /* ---------- Events ---------- */

  listEl.addEventListener("mouseover", (event) => {
    const id = idFromEvent(event);
    if (id) preview(id);
  });
  listEl.addEventListener("mouseleave", () => preview(null));
  listEl.addEventListener("focusin", (event) => {
    const id = idFromEvent(event);
    if (id) preview(id);
  });
  listEl.addEventListener("focusout", (event) => {
    if (!listEl.contains(event.relatedTarget as Node | null)) preview(null);
  });
  listEl.addEventListener("click", (event) => {
    const id = idFromEvent(event);
    if (id) callbacks.onSelect(id);
  });

  header.addEventListener("click", () => setMenuOpen(!menuOpen));

  header.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMenuOpen(true, true);
    }
  });

  collapse.addEventListener("click", () => setOpen(!isOpen()));

  menu.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".entry-country",
    );
    const code = button?.dataset.code;
    if (!code) return;

    setMenuOpen(false);
    header.focus();
    callbacks.onCountrySelect(code);
  });

  menu.addEventListener("keydown", (event) => {
    const options = optionButtons();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        options[Math.min(options.length - 1, index + 1)]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        options[Math.max(0, index - 1)]?.focus();
        break;
      case "Home":
        event.preventDefault();
        options[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        options[options.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        header.focus();
        break;
    }
  });

  // Klick außerhalb schließt die Auswahl
  document.addEventListener("pointerdown", (event) => {
    if (menuOpen && !head.contains(event.target as Node)) setMenuOpen(false);
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filter = button.dataset.filter as Filter;
      render();
    });
  });

  setOpen(isOpen(), false);
  render();

  return {
    element: panel,
    /** Land (und Flagge) im Kopf des Panels */
    setCountry(name: string, flagUrl?: string | null) {
      country = name;
      applyFlag(flagUrl);
      render();
    },
    /** Auswahlliste der Länder */
    setCountries(next: EntryListCountry[], selected: string) {
      countries = next;
      selectedCode = selected;
      renderMenu();
    },
    /** Einträge ersetzen (bereits sortiert, neueste zuerst) */
    setData(next: EntryListItem[]) {
      items = next;
      render();
    },
    /** Eintrag hervorheben; mit scroll = true wird er in den Sichtbereich gescrollt */
    setActive(id: string | null, scroll = false) {
      activeId = id;
      applyActive(scroll);
    },
    setOpen,
  };
}

export type EntryList = ReturnType<typeof createEntryList>;
