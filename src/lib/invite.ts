import { hideModal } from "../page/main";
import { supabase } from "./supabase";

const { data: userData } = await supabase.auth.getUser();
const button = document.getElementById("inviteBtn") as HTMLButtonElement;

button.addEventListener("click", async () => {
  const email = (document.getElementById("email") as HTMLInputElement).value;
  const firstName = (document.getElementById("firstName") as HTMLInputElement).value;
  const lastName = (document.getElementById("lastName") as HTMLInputElement).value;

  if (!userData.user) {
    alert("Login erforderlich!");
    return;
  }
  
  const {
    data: { session },
  } = await supabase.auth.getSession();
  // console.log("Session aktiv");
  // console.log(session);

  await fetch("https://xwlywwowqbruqbyiehwe.supabase.co/functions/v1/invite-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ email, firstName, lastName }),
  });

  hideModal(document.getElementById("invitation-section") as HTMLDivElement);
});
