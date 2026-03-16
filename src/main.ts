import "./style.css";
import "./lib/slider.ts";
import { supabase } from "./lib/supabase";
// import { selectCountry } from "./lib/map";

async function test() {
  const { data, error } = await supabase.from("entries").select("*");

  console.log("Data:", data, "Error:", error);
}

test();

// const buttons = document.querySelectorAll(".navbar_wrapper button");

// buttons.forEach((button) => {
//   button.addEventListener("click", () => {
//     const country = button.getAttribute("data-country");
//     if (country) {
//       selectCountry(country);
//     }
//   });
// });
