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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const token = authHeader.replace("Bearer ", "");

  // --- User über ANON KEY validieren ---
  const supabaseUserClient = createClient(
    Deno.env.get("SERVICE_URL")!,
    Deno.env.get("SERVICE_ANON_KEY")!,
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUserClient.auth.getUser(token);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  // --- OPTIONAL: Rollenprüfung ---
  if (user.app_metadata?.role !== "administrator") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // --- Request Body ---
  const { email, firstName, lastName } = await req.json();

  if (!email) {
    return new Response(JSON.stringify({ error: "Email required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!firstName || !lastName) {
    return new Response(
      JSON.stringify({ error: "Firstname and lastname required" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
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
      },
      redirectTo: "http://localhost:5173/reset-passwort.hmtl"
    },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: corsHeaders,
  });
});

// --- CORS Headers ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
