// A photo from the phone's camera, made small before it is sent (Van sales: a diesel slip, a closed
// shop): at most 1280 px on the long side as a JPEG — a few dozen KB instead of several MB, so it goes
// up quickly on a slow connection and an old phone.
const MAX_SIDE = 1280;

export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    // An image the browser can't read: sent as it is (the server checks its size and type).
    return file;
  }
}

/** The photo as a form for uploadVanPhotoAction. */
export async function photoForm(file: File): Promise<FormData> {
  const form = new FormData();
  form.append("photo", await shrinkPhoto(file));
  return form;
}
