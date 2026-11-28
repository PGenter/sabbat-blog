// Service Worker für Browser-Benachrichtigungen (Web Push).
// Läuft auch, wenn kein Tab der App geöffnet ist.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Koala, Kiwi & Coconut", body: event.data?.text() ?? "" };
  }

  const title = data.title || "Koala, Kiwi & Coconut";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/apple-touch-icon.png",
      badge: "/KoalaKiwiCocoFavi.png",
      tag: data.tag,
      data: { url: data.url || "/map.html" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/map.html",
    self.location.origin,
  );

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Ist die Karte schon offen, dort direkt den Eintrag öffnen
      const mapWindow = windows.find(
        (client) => new URL(client.url).pathname === "/map.html",
      );
      if (mapWindow) {
        mapWindow.postMessage({
          type: "open-entry",
          entry: target.searchParams.get("entry"),
          photo: target.searchParams.get("photo"),
        });
        return mapWindow.focus();
      }

      // Immer auf der eigenen Domain öffnen (auch bei lokalen Tests)
      return self.clients.openWindow(target.pathname + target.search);
    })(),
  );
});
