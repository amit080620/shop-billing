/** Reads a File or Blob as a base64 string (no data-URL prefix) —
 * what the Gemini API's inlineData expects. Accepts Blob (not just
 * File) since the resize/preprocess pipeline returns a plain Blob.
 * Shared by every scan flow that sends a photo to
 * lib/actions/aiScan.ts, instead of each one re-writing its own
 * FileReader boilerplate. */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
