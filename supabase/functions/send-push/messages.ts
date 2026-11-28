// Texte der Benachrichtigungen (Deutsch/Spanisch, je nach Sprache des Geräts)

export type PushKind =
  | "new_entry"
  | "new_comment"
  | "comment_reply"
  | "comment_reaction";

export type PushGroup = { kind: PushKind; user_ids: string[] };

export type PushPayload = {
  entry_id?: string;
  entry_title?: string | null;
  entry_title_es?: string | null;
  photo_id?: string;
  comment_id?: string;
  actor_name?: string | null;
  comment_excerpt?: string | null;
  emoji?: string | null;
  groups: PushGroup[];
};

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function buildMessage(
  kind: PushKind,
  p: PushPayload,
  language: string,
  appUrl: string,
): PushMessage {
  const es = language === "spanish";
  const entryTitle = (es ? p.entry_title_es || p.entry_title : p.entry_title) ||
    (es ? "una estación" : "einer Station");
  const actor = p.actor_name?.trim() || (es ? "Alguien" : "Jemand");
  const excerpt = shorten(p.comment_excerpt ?? "", 120);

  const params = new URLSearchParams();
  if (p.entry_id) params.set("entry", p.entry_id);
  if (p.photo_id) params.set("photo", p.photo_id);
  const url = `${appUrl.replace(/\/$/, "")}/map.html${
    params.size ? `?${params}` : ""
  }`;

  switch (kind) {
    case "new_entry":
      return {
        title: es ? `Nueva estación: ${entryTitle}` : `Neue Station: ${entryTitle}`,
        body: es
          ? `${actor} ha subido fotos nuevas.`
          : `${actor} hat neue Fotos hochgeladen.`,
        url,
        tag: `entry-${p.entry_id}`,
      };
    case "new_comment":
      return {
        title: es
          ? `Nuevo comentario en ${entryTitle}`
          : `Neuer Kommentar bei ${entryTitle}`,
        body: `${actor}: ${excerpt}`,
        url,
        tag: `comment-${p.comment_id}`,
      };
    case "comment_reply":
      return {
        title: es
          ? `Respuesta a tu comentario (${entryTitle})`
          : `Antwort auf deinen Kommentar (${entryTitle})`,
        body: `${actor}: ${excerpt}`,
        url,
        tag: `comment-${p.comment_id}`,
      };
    case "comment_reaction":
      return {
        title: es
          ? `${actor} reaccionó con ${p.emoji ?? "👍"}`
          : `${actor} hat mit ${p.emoji ?? "👍"} reagiert`,
        body: es
          ? `a tu comentario: «${excerpt}»`
          : `auf deinen Kommentar: „${excerpt}“`,
        url,
        tag: `reaction-${p.comment_id}`,
      };
  }
}

function shorten(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
