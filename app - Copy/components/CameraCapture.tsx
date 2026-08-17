"use client";

import { useEffect, useRef, useState } from "react";
import { X, Camera, Image as ImageIcon } from "lucide-react";

type CameraCaptureProps = {
  onCapture: (file: Blob) => void;
  onCancel: () => void;
};

/** Live camera capture with a gallery-upload fallback. Requests the
 * rear camera (facingMode: "environment") since that's what you point
 * at a receipt — the front camera is the wrong default for this. */
export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!window.isSecureContext) {
        setError("Camera needs a secure (https) connection. You can still upload a photo from your gallery below.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser doesn't support camera access. Please upload a photo instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError") {
          setError("Camera permission was denied. Allow it in your browser settings, or upload a photo instead.");
        } else if (name === "NotFoundError") {
          setError("No camera was found on this device. Please upload a photo instead.");
        } else {
          setError("Couldn't open the camera. Please upload a photo instead.");
        }
      }
    }
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onCancel} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white">
          <X size={14} /> Cancel
        </button>
        <p className="text-sm text-white/80">Scan bill</p>
        <div className="w-16" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <Camera size={40} className="text-white/70" />
            <p className="text-sm text-white/90">{error}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        )}
      </div>

      <div className="flex items-center justify-center gap-6 p-6">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 rounded-full bg-white/10 px-4 py-3 text-xs text-white"
        >
          <ImageIcon size={16} /> Gallery
        </button>
        {!error && (
          <button
            onClick={capture}
            disabled={!ready}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-4 ring-white/30 disabled:opacity-50"
            aria-label="Capture"
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture(file);
        }}
      />
    </div>
  );
}
