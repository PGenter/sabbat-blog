// Browser-Benachrichtigungen (Web Push)
//
// Ein Gerät wird angemeldet, indem der Service Worker (public/sw.js) beim
// Browser ein Push-Abo anlegt und dieses über register_push_subscription()
// in der Datenbank gespeichert wird. Welche Arten von Benachrichtigungen eine
// Person bekommt, steht in notification_settings und gilt für alle Geräte.
// Verschickt wird serverseitig (siehe supabase/snippets/push-notifications.sql
// und supabase/functions/send-push).

import { supabase } from "./supabase.ts";
import type { Language } from "./i18n.ts";

export type NotificationKind =
  | "new_entry"
  | "new_comment"
  | "comment_reply"
  | "comment_reaction";

export type NotificationSettings = Record<NotificationKind, boolean>;

export const DEFAULT_SETTINGS: NotificationSettings = {
  new_entry: true,
  new_comment: true,
  comment_reply: true,
  comment_reaction: true,
};

export type PushSupport =
  | "supported"
  | "unsupported"
  // iPhone/iPad: Web Push nur, wenn die Seite zum Home-Bildschirm
  // hinzugefügt wurde
  | "ios-needs-install"
  | "missing-key";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null =
  null;

export function getPushSupport(): PushSupport {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isIos && !isStandalone) return "ios-needs-install";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (!VAPID_PUBLIC_KEY) return "missing-key";
  return "supported";
}

export function getPermission(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

// Service Worker registrieren (einmal pro Seitenaufruf)
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  registrationPromise ??= navigator.serviceWorker
    .register("/sw.js")
    .catch((error) => {
      console.error("Service Worker konnte nicht registriert werden:", error);
      return null;
    });
  return registrationPromise;
}

async function getRegistration() {
  await registerServiceWorker();
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready;
}

export async function getDeviceSubscription() {
  if (getPushSupport() !== "supported") return null;
  const registration = await getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function saveSubscription(
  subscription: PushSubscription,
  language: Language,
) {
  const json = subscription.toJSON();
  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_language: language,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

// Benachrichtigungen auf diesem Gerät einschalten. Fragt beim ersten Mal den
// Browser nach der Erlaubnis.
export async function enablePushOnThisDevice(language: Language) {
  if (getPushSupport() !== "supported") {
    throw new Error("push-unsupported");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("permission-denied");
  }

  const registration = await getRegistration();
  if (!registration) throw new Error("push-unsupported");

  let subscription = await registration.pushManager.getSubscription();
  if (
    subscription &&
    !sameKey(subscription.options.applicationServerKey, VAPID_PUBLIC_KEY!)
  ) {
    // Mit einem alten Schlüssel angelegt -> neu anlegen
    await subscription.unsubscribe();
    subscription = null;
  }

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
  });

  await saveSubscription(subscription, language);
}

// Benachrichtigungen auf diesem Gerät ausschalten (z.B. auch beim Logout)
export async function disablePushOnThisDevice() {
  const subscription = await getDeviceSubscription();
  if (!subscription) return;

  const { error } = await supabase.rpc("unregister_push_subscription", {
    p_endpoint: subscription.endpoint,
  });
  if (error) console.error("Abmelden des Geräts fehlgeschlagen:", error);
  await subscription.unsubscribe();
}

// Beim Start und nach einem Sprachwechsel: vorhandenes Abo (Schlüssel können
// sich ändern) und die Sprache der Benachrichtigungen aktualisieren.
export async function syncPushSubscription(language: Language) {
  try {
    if (getPermission() !== "granted") return;
    const subscription = await getDeviceSubscription();
    if (subscription) await saveSubscription(subscription, language);
  } catch (error) {
    console.error("Push-Abo konnte nicht aktualisiert werden:", error);
  }
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from("notification_settings")
    .select("new_entry, new_comment, comment_reply, comment_reaction")
    .maybeSingle();

  if (error) {
    console.error("Benachrichtigungs-Einstellungen nicht ladbar:", error);
  }
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function saveNotificationSettings(
  userId: string,
  settings: NotificationSettings,
) {
  const { error } = await supabase.from("notification_settings").upsert(
    {
      user_id: userId,
      ...settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

// Nach einem vollständigen Upload alle anderen über den neuen Eintrag
// informieren. Fehler hier dürfen den Upload nicht als gescheitert zeigen.
export async function notifyEntryPublished(entryId: string) {
  const { error } = await supabase.rpc("notify_entry_published", {
    p_entry_id: String(entryId),
  });
  if (error) {
    console.error("Benachrichtigung zum neuen Eintrag fehlgeschlagen:", error);
  }
}

// Klick auf eine Benachrichtigung, während die Karte schon offen ist
export function onNotificationOpen(
  handler: (entryId: string, photoId: string | null) => void,
) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data;
    if (data?.type === "open-entry" && data.entry) {
      handler(String(data.entry), data.photo ? String(data.photo) : null);
    }
  });
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null, expected: string) {
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(expected);
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
