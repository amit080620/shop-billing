/** Reads a File as a base64 string (no data-URL prefix) — what the
 * Gemini API's inline_data expects. Shared by every scan flow that
 * sends a photo to lib/actions/aiScan.ts, instead of each one
 * re-writing its own FileReader boilerplate. */
export function fileToBase64(file: File): Promise<string> {
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
