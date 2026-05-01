import { createClient } from "@supabase/supabase-js";

Deno.serve(async (req) => {
  // --- CORS Preflight ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // --- Authorization Header prüfen ---
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Zugang verweigert", code: "UNAUTHORIZED" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");

  const supabaseUserClient = createClient(
    Deno.env.get("SERVICE_URL")!,
    Deno.env.get("SERVICE_ANON_KEY")!,
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user) {
    return jsonResponse({ error: "Zugang verweigert", code: "UNAUTHORIZED" }, 401);
  }

  if (user.app_metadata?.role !== "administrator") {
    return jsonResponse({ error: "Fehlende Berechtigung", code: "FORBIDDEN" }, 403);
  }

  const { email, firstName, lastName } = await req.json();

  if (!email) {
    return jsonResponse({ error: "Email-Adresse erforderlich", code: "VALIDATION_ERROR" }, 400);
  }

  if (!firstName || !lastName) {
    return jsonResponse({ error: "Vorname und Nachname erforderlich", code: "VALIDATION_ERROR" }, 400);
  }

  const displayName = firstName + " " + lastName;

  // --- Admin Client (Service Role) ---
  const supabaseAdmin = createClient(
    Deno.env.get("SERVICE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      data: {
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
      },
      redirectTo: "https://localhost:5173/auth/confirm?type=invite&next=/reset-password.html"
    },
  );

  if (error) {
    return jsonResponse({ error: "Allgemeiner Fehler: " + error.message, code: "VALIDATION_ERROR" }, 400);
  }

  return jsonResponse({ success: true, data, code: "SUCCESS" }, 200);
});

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// --- CORS Headers ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
