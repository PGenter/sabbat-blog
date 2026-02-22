import { supabase } from "../lib/supabase";
import { determineSection } from "../lib/geo";
import { v4 as uuidv4 } from "uuid";
import * as exifr from "exifr";

const input = document.getElementById("images") as HTMLInputElement;
const descriptionEl = document.getElementById(
  "description",
) as HTMLTextAreaElement;
const button = document.getElementById("uploadBtn") as HTMLButtonElement;

button.addEventListener("click", async () => {
  const files = input.files;
  const description = descriptionEl.value;
  const processedFiles = [];

  if (!files || files.length === 0) {
    alert("Keine Bilder ausgewählt");
    return;
  }

  if (!description) {
    alert("Bitte Beschreibung eingeben");
    return;
  }

  for (const file of Array.from(files)) {
    const exif = await exifr.parse(file);

    const lat = exif?.latitude;
    const lng = exif?.longitude;
    const takenAt = exif?.DateTimeOriginal || new Date();

    processedFiles.push({
      file,
      latitude: lat ?? null,
      longitude: lng ?? null,
      takenAt,
    });
  }

  const gpsFiles = processedFiles.filter((f) => f.latitude && f.longitude);

  if (gpsFiles.length === 0) {
    alert("Keines der Bilder enthält GPS-Daten. Standort muss aktiviert sein.");
    return;
  }
  const avgLat =
    gpsFiles.reduce((sum, f) => sum + f.latitude!, 0) / gpsFiles.length;
  const avgLng =
    gpsFiles.reduce((sum, f) => sum + f.longitude!, 0) / gpsFiles.length;
  const section = determineSection(avgLat, avgLng);
  const earliestDate = processedFiles
    .map((f) => new Date(f.takenAt))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  processedFiles.forEach((f) => {
    if (!f.latitude || !f.longitude) {
      f.latitude = avgLat;
      f.longitude = avgLng;
    }
  });

  // 1️⃣ Entry erstellen (Dummy-Daten erstmal)
  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      description,
      section: section,
      latitude: avgLat,
      longitude: avgLng,
      taken_at: earliestDate.toISOString(),
    })
    .select()
    .single();

  if (entryError) {
    console.error(entryError);
    return;
  }

  const entryId = entry.id;

  // 2️⃣ Bilder hochladen
  for (const file of Array.from(processedFiles)) {
    const fileName = `${uuidv4()}.jpg`;
    const filePath = `${entryId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("travel-images")
      .upload(filePath, file.file);

    if (uploadError) {
      console.error(uploadError);
      return;
    }

    const { data: publicUrl } = supabase.storage
      .from("travel-images")
      .getPublicUrl(filePath);

    // 3️⃣ Foto in DB speichern
    await supabase.from("photos").insert({
      entry_id: entryId,
      image_url: publicUrl.publicUrl,
      thumbnail_url: publicUrl.publicUrl,
      latitude: file.latitude,
      longitude: file.longitude,
      taken_at: file.takenAt,
    });
  }

  alert("Upload erfolgreich!");
});
