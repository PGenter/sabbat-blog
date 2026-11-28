import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { buildMessage, type PushGroup, type PushPayload } from "./messages.ts";

// Wird ausschließlich von der Datenbank (pg_net, siehe
// supabase/snippets/push-notifications.sql) aufgerufen. Die Datenbank hat die
// Empfänger schon ausgewählt; hier werden nur noch ihre Geräte gesucht, die
// Texte in der Sprache des jeweiligen Geräts gebaut und verschickt.

const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://koala-kiwi-coconut.de";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@koala-kiwi-coconut.de",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  if (!WEBHOOK_SECRET || req.headers.get("x-push-secret") !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const groups = (payload.groups ?? []).filter(
    (g: PushGroup) => Array.isArray(g.user_ids) && g.user_ids.length > 0,
  );
  const userIds = [...new Set(groups.flatMap((g) => g.user_ids))];
  if (userIds.length === 0) return json({ sent: 0 });

  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, language")
    .in("user_id", userIds);

  if (error) {
    console.error("Abos konnten nicht geladen werden:", error);
    return json({ error: error.message }, 500);
  }

  const byUser = new Map<string, Subscription[]>();
  for (const sub of (subscriptions ?? []) as Subscription[]) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  const expired: string[] = [];
  let sent = 0;
  let failed = 0;

  const jobs: Promise<void>[] = [];
  for (const group of groups) {
    for (const userId of group.user_ids) {
      for (const sub of byUser.get(userId) ?? []) {
        const message = buildMessage(group.kind, payload, sub.language, APP_URL);
        jobs.push(
          webpush
            .sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify(message),
              { TTL: 60 * 60 * 24, urgency: "normal" },
            )
            .then(() => {
              sent++;
            })
            .catch((err: { statusCode?: number; body?: string }) => {
              // 404/410: Browser hat das Abo verworfen -> aufräumen
              if (err?.statusCode === 404 || err?.statusCode === 410) {
                expired.push(sub.id);
              } else {
                failed++;
                console.error(
                  "Push fehlgeschlagen:",
                  err?.statusCode,
                  err?.body ?? err,
                );
              }
            }),
        );
      }
    }
  }

  await Promise.all(jobs);

  if (expired.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expired);
  }

  return json({ sent, failed, expired: expired.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
