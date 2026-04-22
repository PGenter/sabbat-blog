export function getErrorMessage(error: any): string {
  if (!error) return "Unbekannter Fehler";

  const code = error.code || error.error || error.status;

  switch (code) {
    case "42501":
      return "Keine Berechtigung für diese Aktion.";

    case "23505":
      return "Eintrag existiert bereits.";

    case "23503":
      return "Verknüpfte Daten fehlen.";

    case "401":
      return "Nicht eingeloggt oder Session abgelaufen.";

    case "403":
      return "Zugriff verweigert.";

    case "500":
      return "Serverfehler. Bitte später erneut versuchen.";

    default:
      return error.message || "Ein unerwarteter Fehler ist aufgetreten.";
  }
}

export function handleError(error: any) {
  console.error(error);
  alert(getErrorMessage(error));
}