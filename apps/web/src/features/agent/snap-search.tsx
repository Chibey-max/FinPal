"use client";

import { useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";

/**
 * Photo → Groq vision → shopping-list text. Menu offers a live camera
 * capture or a file upload; does not shop or pay.
 */
export function SnapSearchButton({
  value,
  onChange,
  disabled,
  onError,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onFile(file: File | undefined) {
    if (!file || busy || disabled) return;
    setBusy(true);
    setOpen(false);
    setCameraOpen(false);
    try {
      const body = new FormData();
      body.append("image", file, file.name || "snap.jpg");
      const response = await fetch("/api/v1/agent/vision", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => null)) as {
        text?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(
          data?.error?.message ?? `Snap search failed (${response.status}).`,
        );
      }
      const text = data?.text?.trim();
      if (!text) throw new Error("No product was recognized in that photo.");
      const next = value.trim() ? `${value.trim()}\n${text}` : text;
      onChange(next.slice(0, 1000));
    } catch (error) {
      onError?.(errorMessage(error));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      ref={rootRef}
      className="agent-snap"
      data-busy={busy || undefined}
      data-open={open || undefined}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className="agent-mic"
        disabled={disabled || busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={busy ? "Reading photo" : "Snap a product to search"}
        title="Take a photo or upload an image — FinPal turns it into a list line"
        onClick={() => {
          if (busy || disabled) return;
          setOpen((value) => !value);
        }}
      >
        <SnapIcon />
        <span className="agent-mic__label">{busy ? "Reading…" : "Snap"}</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" className="agent-snap__menu">
          <button
            type="button"
            role="menuitem"
            className="agent-snap__option"
            onClick={() => {
              setOpen(false);
              setCameraOpen(true);
            }}
          >
            <CameraIcon />
            Take photo
          </button>
          <button
            type="button"
            role="menuitem"
            className="agent-snap__option"
            onClick={() => {
              setOpen(false);
              // Keep this in the same click turn so the picker stays allowed.
              fileRef.current?.click();
            }}
          >
            <UploadIcon />
            Upload image
          </button>
        </div>
      ) : null}
      {cameraOpen ? (
        <CameraCapture
          onCancel={() => setCameraOpen(false)}
          onCapture={(file) => void onFile(file)}
          onError={(message) => {
            setCameraOpen(false);
            onError?.(message);
          }}
        />
      ) : null}
    </div>
  );
}

/** Live getUserMedia shutter — real camera, not the file picker. */
function CameraCapture({
  onCancel,
  onCapture,
  onError,
}: {
  onCancel: () => void;
  onCapture: (file: File) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onErrorRef = useRef(onError);
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current("Camera is not available in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch {
        onErrorRef.current(
          "Could not open the camera. Allow camera access, or use Upload image.",
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !ready || shooting) return;
    setShooting(true);
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setShooting(false);
      onError("Could not capture that frame.");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        setShooting(false);
        if (!blob) {
          onError("Could not capture that frame.");
          return;
        }
        const stream = streamRef.current;
        streamRef.current = null;
        if (stream) for (const track of stream.getTracks()) track.stop();
        onCapture(
          new File([blob], `snap-${Date.now()}.jpg`, { type: "image/jpeg" }),
        );
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div
      className="agent-camera"
      role="dialog"
      aria-modal="true"
      aria-label="Take a product photo"
    >
      <div className="agent-camera__card">
        <div className="agent-camera__stage">
          <video
            ref={videoRef}
            className="agent-camera__video"
            playsInline
            muted
            autoPlay
          />
          {!ready ? (
            <p className="agent-camera__status">Starting camera…</p>
          ) : null}
        </div>
        <div className="agent-camera__actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="agent-camera__shutter"
            disabled={!ready || shooting}
            onClick={snap}
            aria-label="Capture photo"
          >
            {shooting ? "Saving…" : "Capture"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SnapIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="14" r="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M4 19h16" />
    </svg>
  );
}
