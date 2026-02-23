import { supabase } from "../lib/supabase";
import { determineSection } from "../lib/geo";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";
import * as exifr from "exifr";

const input = document.getElementById("images") as HTMLInputElement;
const descriptionEl = document.getElementById(
  "description",
) as HTMLTextAreaElement;
const button = document.getElementById("uploadBtn") as HTMLButtonElement;

button.addEventListener("click", async () => {
  const files = input.files;
  const description = descriptionEl.value;

  if (!files || files.length === 0) {
    alert("Keine Bilder ausgewählt");
    return;
  }

  if (!description) {
    alert("Bitte Beschreibung eingeben");
    return;
  }

  const processedFiles = [];

  for (const originalFile of Array.from(files)) {
    // 🔥 1️⃣ Bild komprimieren
    // 🔥 FULL VERSION
    const fullImage = await imageCompression(originalFile, {
      maxWidthOrHeight: 1920,
      initialQuality: 0.8,
      useWebWorker: true,
    });

    // 🔥 THUMBNAIL
    const thumbnail = await imageCompression(fullImage, {
      maxWidthOrHeight: 500,
      initialQuality: 0.7,
      useWebWorker: true,
    });

    console.log("Original:", originalFile.size / 1024 / 1024, "MB");
    console.log("Compressed:", fullImage.size / 1024 / 1024, "MB");
    console.log("Thumbnail:", thumbnail.size / 1024 / 1024, "MB");

    // 🔥 2️⃣ EXIF vom Original lesen (nicht vom komprimierten!)
    const exif = await exifr.parse(originalFile);

    const lat = exif?.latitude;
    const lng = exif?.longitude;
    const takenAt = exif?.DateTimeOriginal || new Date();

    processedFiles.push({
      fullImage,
      thumbnail,
      latitude: lat ?? null,
      longitude: lng ?? null,
      takenAt,
    });
  }

  const gpsFiles = processedFiles.filter((f) => f.latitude && f.longitude);

  if (gpsFiles.length === 0) {
    alert("Keines der Bilder enthält GPS-Daten.");
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

  // 🔥 Transaktions-Tracking
  let entryId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    // 1️⃣ Entry erstellen
    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .insert({
        description,
        section,
        latitude: avgLat,
        longitude: avgLng,
        taken_at: earliestDate.toISOString(),
      })
      .select()
      .single();

    if (entryError) throw entryError;

    entryId = entry.id;

    // 2️⃣ Bilder hochladen
    for (const fileData of processedFiles) {
      const fileName = `${uuidv4()}.jpg`;

      const fullPath = `${entryId}/full/${fileName}`;
      const thumbPath = `${entryId}/thumb/${fileName}`;

      const { error: fullError } = await supabase.storage
        .from("travel-images")
        .upload(fullPath, fileData.fullImage);

      if (fullError) throw fullError;

      const { error: thumbError } = await supabase.storage
        .from("travel-images")
        .upload(thumbPath, fileData.thumbnail);

      if (thumbError) throw thumbError;

      uploadedPaths.push(fullPath, thumbPath);

      const { data: fullUrl } = supabase.storage
        .from("travel-images")
        .getPublicUrl(fullPath);

      const { data: thumbUrl } = supabase.storage
        .from("travel-images")
        .getPublicUrl(thumbPath);

      const { error: photoError } = await supabase.from("photos").insert({
        entry_id: entryId,
        image_url: fullUrl.publicUrl,
        thumbnail_url: thumbUrl.publicUrl,
        latitude: fileData.latitude,
        longitude: fileData.longitude,
        taken_at: fileData.takenAt,
      });

      if (photoError) throw photoError;
    }

    alert("Upload erfolgreich!");
  } catch (error) {
    console.error("Upload fehlgeschlagen:", error);

    // 🔥 ROLLBACK

    // 1️⃣ Storage löschen
    if (uploadedPaths.length > 0) {
      await supabase.storage.from("travel-images").remove(uploadedPaths);
    }

    // 2️⃣ Entry + Photos löschen (Cascade wäre noch besser)
    if (entryId) {
      // await supabase.from("photos").delete().eq("entry_id", entryId);
      await supabase.from("entries").delete().eq("id", entryId);
    }

    alert("Upload fehlgeschlagen. Alles wurde zurückgesetzt.");
  }
});
