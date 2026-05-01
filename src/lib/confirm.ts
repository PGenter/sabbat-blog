import { supabase } from "../lib/supabase";

const params = new URLSearchParams(window.location.search);

const token_hash = params.get("token_hash");
const type = params.get("type");
const next = params.get("next") || "/reset-password.html";

if (token_hash && type) {
  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as any,
  });

  if (!error) {
    window.location.href = next;
  } else {
    console.error(error);
    document.body.innerText = "Link ungültig oder abgelaufen";
  }
}