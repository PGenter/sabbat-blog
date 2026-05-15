import { supabase } from "../lib/supabase";
import { determineSection } from "../lib/geo";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";
import * as exifr from "exifr";
import { handleError } from "../lib/errorHandler";
import { t } from "../lib/i18n.ts";

export async function startUpload() {
  const { data: userData } = await supabase.auth.getUser();

  type ProcessedFile = {
    fullImage: File;
    thumbnail: File;
    latitude: number | null;
    longitude: number | null;
    takenAt: Date;
  };

  const progressContainer = document.getElementById("progressContainer")!;
  const progressBar = document.getElementById("progressBar")!;
  const progressText = document.getElementById("progressText")!;

  const input = document.getElementById("images") as HTMLInputElement;
  const titleEl = document.getElementById("title") as HTMLInputElement;
  const descriptionEl = document.getElementById(
    "description",
  ) as HTMLTextAreaElement;
  const button = document.getElementById("uploadBtn") as HTMLButtonElement;
  const fileLabel = document.querySelector(".file-label") as HTMLElement | null;

  if (titleEl) titleEl.placeholder = t("titlePlaceholder");
  if (descriptionEl) descriptionEl.placeholder = t("descriptionPlaceholder");
  if (fileLabel) fileLabel.textContent = t("chooseImages");
  if (button)
    button.innerHTML = `<i class="bi bi-cloud-arrow-up"></i> ${t("uploadStart")}`;

  button.addEventListener("click", async () => {
    if (!userData.user) {
      console.error("Kein Benutzer eingeloggt");
      alert(t("loginRequired"));
      return;
    }
    const files = input.files;
    const title = titleEl.value;
    const description = descriptionEl.value;

    if (!files || files.length === 0) {
      alert(t("noImagesSelected"));
      return;
    }

    if (!title) {
      alert(t("pleaseProvideTitle"));
      return;
    }

    if (!description) {
      alert(t("pleaseProvideDescription"));
      return;
    }

    const processedFiles: ProcessedFile[] = [];

    button.disabled = true;
    button.innerHTML = `<i class="bi bi-cloud-arrow-up"></i> ${t("uploadRunning")}`;

    for (const originalFile of Array.from(files)) {
      // Bild komprimieren
      // FULL VERSION
      const fullImage = await imageCompression(originalFile, {
        maxWidthOrHeight: 1920,
        initialQuality: 0.8,
        useWebWorker: true,
      });

      // THUMBNAIL
      const thumbnail = await imageCompression(fullImage, {
        maxWidthOrHeight: 400,
        initialQuality: 0.7,
        useWebWorker: true,
      });

      console.log("Original:", originalFile.size / 1024 / 1024, "MB");
      console.log("Compressed:", fullImage.size / 1024 / 1024, "MB");
      console.log("Thumbnail:", thumbnail.size / 1024 / 1024, "MB");

      // 2️⃣ EXIF vom Original lesen (nicht vom komprimierten!)
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
      alert(t("noGpsData"));
      return;
    }

    const avgLat =
      gpsFiles.reduce((sum, f) => sum + f.latitude!, 0) / gpsFiles.length;

    const avgLng =
      gpsFiles.reduce((sum, f) => sum + f.longitude!, 0) / gpsFiles.length;

    const section = await determineSection(avgLat, avgLng);

    const earliestDate = processedFiles
      .map((f) => new Date(f.takenAt))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    processedFiles.forEach((f) => {
      if (!f.latitude || !f.longitude) {
        f.latitude = avgLat;
        f.longitude = avgLng;
      }
    });

    // Transaktions-Tracking
    let entryId: string | null = null;
    const uploadedPaths: string[] = [];

    try {
      let completed = 0;
      const total = processedFiles.length;
      progressContainer.style.display = "block";
      updateProgress();

      function updateProgress() {
        const percent = Math.round((completed / total) * 100);
        progressBar.style.width = percent + "%";
        progressText.textContent = `${completed} von ${total} Bildern verarbeitet (${percent}%)`;
      }
      // Entry erstellen
      const { data: entry, error: entryError } = await supabase
        .from("entries")
        .insert({
          title,
          description,
          section,
          latitude: avgLat,
          longitude: avgLng,
          taken_at: earliestDate.toISOString(),
          user_id: userData.user.id,
        })
        .select()
        .single();

      if (entryError) throw entryError;

      entryId = entry.id;

      // Bilder hochladen
      const results = await runWithConcurrencyLimit(
        processedFiles,
        4, // Limit
        async (fileData) => {
          const result = await processAndUploadImage(
            fileData,
            entryId!,
            userData.user.id,
          );

          completed++;
          updateProgress();

          return result;
        },
      );

      uploadedPaths.push(...results.flat());
    } catch (error) {
      console.error("Upload fehlgeschlagen:", error);

      // ROLLBACK
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("travel-images").remove(uploadedPaths);
      }

      if (entryId) {
        await supabase.from("entries").delete().eq("id", entryId);
      }

      progressContainer.style.display = "none";

      handleError(error);
    }
    button.disabled = false;
    button.innerHTML = `<i class="bi bi-cloud-arrow-up"></i> ${t("uploadStart")}`;
  });

  async function processAndUploadImage(
    fileData: ProcessedFile,
    entryId: string,
    userId: string,
  ): Promise<string[]> {
    const fileName = `${uuidv4()}.jpg`;

    const fullPath = `${entryId}/full/${fileName}`;
    const thumbPath = `${entryId}/thumb/${fileName}`;

    // Upload Full
    const { error: fullError } = await supabase.storage
      .from("travel-images")
      .upload(fullPath, fileData.fullImage);

    if (fullError) throw fullError;

    // Upload Thumb
    const { error: thumbError } = await supabase.storage
      .from("travel-images")
      .upload(thumbPath, fileData.thumbnail);

    if (thumbError) throw thumbError;

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
      user_id: userId,
    });

    if (photoError) throw photoError;

    return [fullPath, thumbPath]; // Für Rollback
  }

  async function runWithConcurrencyLimit<T>(
    items: T[],
    limit: number,
    asyncFn: (item: T) => Promise<any>,
  ) {
    const results: any[] = [];
    const executing: Promise<any>[] = [];

    for (const item of items) {
      const p = asyncFn(item).then((result) => {
        executing.splice(executing.indexOf(p), 1);
        return result;
      });

      results.push(p);
      executing.push(p);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }
}
