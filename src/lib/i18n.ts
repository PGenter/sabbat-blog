export const SUPPORTED_LANGUAGES = ["german", "spanish"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const translations = {
  german: {
    logout: "Logout",
    upload: "Upload",
    editMap: "Einträge bearbeiten",
    editGallery: "Galerie bearbeiten",
    invite: "Freunde einladen",
    languageToggleTitle: "Sprache wechseln",
    photoGallery: "Foto Galerie",
    map: "Karte",
    newUserInvite: "Freunde einladen",
    photoUpload: "Foto Upload",
    firstNamePlaceholder: "Vorname",
    lastNamePlaceholder: "Nachname",
    emailPlaceholder: "Email",
    inviteSend: "Einladung versenden",
    titlePlaceholder: "Gib einen Titel für die Etappe an...",
    descriptionPlaceholder: "Beschreibe, was wir erlebt haben...",
    chooseImages: "Bilder auswählen",
    noFileSelected: "Kein Bild ausgewählt",
    fileSelectedSingle: "1 Datei ausgewählt",
    filesSelected: "Dateien ausgewählt",
    uploadStart: "Upload starten",
    uploadRunning: "Upload läuft...",
    loginRequired: "Login erforderlich!",
    noImagesSelected: "Keine Bilder ausgewählt",
    pleaseProvideTitle: "Bitte gib einen Titel an",
    pleaseProvideDescription: "Bitte gib eine Beschreibung ein",
    noGpsData: "Keines der Bilder enthält GPS-Daten.",
    hello: "Hallo",
    welcomeLine1: "schön, dass du hier bist! Auf dieser Seite kannst du uns auf unserer Reise begleiten.",
    welcomeLine2: "Die Marker auf der Karte zeigen die Stationen, die wir bislang besucht haben.",
    currentLocation: "Aktuell befinden wir uns in",
    noNewStations: "Es gibt aktuell leider keine neuen Stationen zu entdecken. Wir werden bald neue Bilder hochladen. Bis dahin kannst du unsere bisherigen Stationen noch einmal erkunden.",
    oneNewStation: "Es gibt noch <u>{count} Station</u>, die du noch nicht entdeckt hast.",
    manyNewStations: "Es gibt noch <u>{count} Stationen</u>, die du noch nicht entdeckt hast.",
    uploadLabel: "Upload",
    editHint: "Bearbeiten",
    editMarker: "Marker bearbeiten",
    save: "Speichern",
    delete: "Löschen",
    confirmDeleteEntry: "Bist du sicher, dass du diesen Eintrag löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.",
    entryDeleted: "Eintrag gelöscht",
    errorSaving: "Fehler beim Speichern: ",
    errorDeleting: "Fehler beim Löschen",
    photoNumber: "Bild",
    of: "von",
    editDescriptionPlaceholder: "Beschreibung bearbeiten...",
    saveDescription: "Beschreibung speichern",
    descriptionSaved: "Beschreibung gespeichert",
    confirmDeletePhoto: "Bist du sicher, dass du dieses Bild löschen möchtest?",
    errorDeletingPhoto: "Fehler beim Löschen des Bildes",
    errorSavingDescription: "Fehler beim Speichern der Beschreibung",
    comments: "Kommentare",
    commentsToggle: "Kommentarbereich öffnen",
    commentPlaceholder: "Schreibe einen Kommentar...",
    addComment: "Kommentar senden",
    noCommentsYet: "Noch keine Kommentare",
    errorSavingComment: "Fehler beim Speichern des Kommentars",
    loginRequiredComment: "Bitte melde dich an, um zu kommentieren.",
    confirmDeleteComment: "Bist du sicher, dass du diesen Kommentar löschen möchtest?",
    errorDeletingComment: "Fehler beim Löschen des Kommentars",
    commentAuthor: "Benutzer",
    anonymousUser: "Anonym",
    loginTitle: "Bitte melde dich an",
    loginButton: "Login",
    forgotPassword: "Passwort vergessen?",
    resetRequestTitle: "Passwort zurücksetzen",
    resetRequestButton: "Reset-Link senden",
    resetPasswordTitle: "Neues Passwort setzen",
    newPasswordPlaceholder: "Neues Passwort",
    confirmPasswordPlaceholder: "Neues Passwort bestätigen",
    passwordRuleLength: "Mindestens 8 Zeichen",
    passwordRuleLetter: "Mindestens ein Buchstabe",
    passwordRuleNumber: "Mindestens eine Zahl",
    passwordRuleSpecial: "Mindestens ein Sonderzeichen",
    passwordRuleMatch: "Passwörter stimmen überein",
    passwordRequirementsNotMet: "Bitte erfülle alle Passwort-Anforderungen.",
    resetLinkSent: "Reset-Link wurde gesendet! Bitte prüfe deine Email.",
    passwordSetSuccess: "Passwort erfolgreich gesetzt! Weiterleitung...",
    passwordPlaceholder: "Passwort",
  },
  spanish: {
    logout: "Cerrar sesión",
    upload: "Subir",
    editMap: "Editar entradas",
    editGallery: "Editar galería",
    invite: "Invitar amigos",
    languageToggleTitle: "Cambiar idioma",
    photoGallery: "Galería de fotos",
    map: "Mapa",
    newUserInvite: "Invitar amigos",
    photoUpload: "Subida de fotos",
    firstNamePlaceholder: "Nombre",
    lastNamePlaceholder: "Apellido",
    emailPlaceholder: "Correo electrónico",
    inviteSend: "Enviar invitación",
    titlePlaceholder: "Escribe un título para la etapa...",
    descriptionPlaceholder: "Describe lo que vivimos...",
    chooseImages: "Seleccionar imágenes",
    noFileSelected: "Ninguna imagen seleccionada",
    fileSelectedSingle: "1 imagen seleccionada",
    filesSelected: "imágenes seleccionadas",
    uploadStart: "Iniciar subida",
    uploadRunning: "Subiendo...",
    loginRequired: "¡Inicio de sesión requerido!",
    noImagesSelected: "No se seleccionaron imágenes",
    pleaseProvideTitle: "Por favor ingresa un título",
    pleaseProvideDescription: "Por favor ingresa una descripción",
    noGpsData: "Ninguna de las imágenes contiene datos GPS.",
    hello: "Hola",
    welcomeLine1: "¡qué bueno que estés aquí! En esta página puedes acompañarnos en nuestro viaje.",
    welcomeLine2: "Los marcadores en el mapa muestran las estaciones que hemos visitado hasta ahora.",
    currentLocation: "Actualmente nos encontramos en",
    noNewStations: "Actualmente no hay nuevas estaciones para descubrir. Pronto subiremos más fotos. Hasta entonces puedes explorar nuestras estaciones anteriores.",
    oneNewStation: "Todavía hay <u>{count} estación</u> que no has descubierto.",
    manyNewStations: "Todavía hay <u>{count} estaciones</u> que no has descubierto.",
    uploadLabel: "Subida",
    editHint: "Editar",
    editMarker: "Editar marcador",
    save: "Guardar",
    delete: "Eliminar",
    confirmDeleteEntry: "¿Estás seguro de que deseas eliminar esta entrada? Esta acción no se puede deshacer.",
    entryDeleted: "Entrada eliminada",
    errorSaving: "Error al guardar: ",
    errorDeleting: "Error al eliminar",
    photoNumber: "Foto",
    of: "de",
    editDescriptionPlaceholder: "Editar descripción...",
    saveDescription: "Guardar descripción",
    descriptionSaved: "Descripción guardada",
    confirmDeletePhoto: "¿Estás seguro de que deseas eliminar esta foto?",
    errorDeletingPhoto: "Error al eliminar la foto",
    errorSavingDescription: "Error al guardar la descripción",
    comments: "Comentarios",
    commentsToggle: "Abrir la sección de comentarios",
    commentPlaceholder: "Escribe un comentario...",
    addComment: "Enviar comentario",
    noCommentsYet: "Aún no hay comentarios",
    errorSavingComment: "Error al guardar el comentario",
    loginRequiredComment: "Por favor inicia sesión para comentar.",
    confirmDeleteComment: "¿Estás seguro de que deseas eliminar este comentario?",
    errorDeletingComment: "Error al eliminar el comentario",
    commentAuthor: "Usuario",
    anonymousUser: "Anónimo",
    loginTitle: "Por favor inicia sesión",
    loginButton: "Iniciar sesión",
    forgotPassword: "¿Olvidaste tu contraseña?",
    resetRequestTitle: "Restablecer contraseña",
    resetRequestButton: "Enviar enlace de restablecimiento",
    resetPasswordTitle: "Establecer nueva contraseña",
    newPasswordPlaceholder: "Nueva contraseña",
    confirmPasswordPlaceholder: "Confirmar nueva contraseña",
    passwordRuleLength: "Al menos 8 caracteres",
    passwordRuleLetter: "Al menos una letra",
    passwordRuleNumber: "Al menos un número",
    passwordRuleSpecial: "Al menos un carácter especial",
    passwordRuleMatch: "Las contraseñas coinciden",
    passwordRequirementsNotMet: "Por favor cumple todos los requisitos de la contraseña.",
    resetLinkSent: "¡Enlace de restablecimiento enviado! Por favor revisa tu correo.",
    passwordSetSuccess: "¡Contraseña establecida correctamente! Redirigiendo...",
    passwordPlaceholder: "Contraseña",
  },
} as const;

const LANGUAGE_STORAGE_KEY = "sabbat-blog-language";

function getInitialLanguage(): Language {
  if (typeof window !== "undefined") {
    const storedLanguage = getStoredLanguage();
    if (storedLanguage) return storedLanguage;

    const browserLanguage = navigator.language?.slice(0, 2).toLowerCase();
    if (browserLanguage === "de") return "german";
    if (browserLanguage === "es") return "spanish";
  }

  return "german";
}

let currentLanguage: Language = getInitialLanguage();

function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);
}

export function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : null;
}

export function setLanguage(language: Language) {
  currentLanguage = language;
  document.documentElement.lang = getLanguageCode(language);
  if (typeof window !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function t<Key extends keyof typeof translations["german"]>(key: Key): string {
  const dictionary = translations[currentLanguage] as Record<string, string>;
  return dictionary[key] ?? translations.german[key];
}

export function getLanguageFlag(language: Language) {
  return language === "german"
    ? "https://flagcdn.com/w20/de.png"
    : "https://flagcdn.com/w20/es.png";
}

export function getLanguageFlagSet(language: Language) {
  return language === "german"
    ? "https://flagcdn.com/w40/de.png"
    : "https://flagcdn.com/w40/es.png";
}

export function getLanguageCode(language: Language) {
  return language === "german" ? "de-DE" : "es-ES";
}

export function formatCountText(count: number): string {
  if (currentLanguage === "german") {
    if (count === 1) return translations.german.oneNewStation.replace("{count}", String(count));
    return translations.german.manyNewStations.replace("{count}", String(count));
  }
  if (count === 1) return translations.spanish.oneNewStation.replace("{count}", String(count));
  return translations.spanish.manyNewStations.replace("{count}", String(count));
}
