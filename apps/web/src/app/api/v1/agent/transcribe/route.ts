import { NextResponse } from "next/server";

import {
  apiError,
  getApiUserId,
  handleRouteError,
  isRateLimited,
  rateLimited,
  unauthorized,
} from "@/lib/api";
import { getGroqEnv } from "@/lib/env.server";

const MAX_BYTES = 4 * 1024 * 1024;
const WHISPER_MODEL = "whisper-large-v3";

// POST /api/v1/agent/transcribe  multipart audio
// Turns a short voice clip into shopping-list text via Groq Whisper.
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`transcribe:${userId}`, 12, 60_000)) return rateLimited();

  try {
    const apiKey = getGroqEnv().GROQ_API_KEY;
    if (!apiKey) {
      return apiError(
        503,
        "TRANSCRIBE_UNAVAILABLE",
        "Voice transcription needs GROQ_API_KEY. Use browser dictation or type your list.",
      );
    }

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return apiError(400, "VALIDATION_ERROR", "Missing audio file.");
    }
    if (audio.size <= 0 || audio.size > MAX_BYTES) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Audio must be between 1 byte and 4 MB.",
      );
    }
    const type = (audio.type || "audio/webm").toLowerCase().split(";")[0]!;
    if (!type.startsWith("audio/") && type !== "video/webm") {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Unsupported audio type. Use webm, ogg, wav, mp3, or mp4.",
      );
    }

    const body = new FormData();
    body.append("file", audio, audio.name || "dictation.webm");
    body.append("model", WHISPER_MODEL);
    body.append("response_format", "json");
    body.append("temperature", "0");

    let response: Response;
    try {
      response = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body,
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      return apiError(
        503,
        "TRANSCRIBE_UNAVAILABLE",
        "Groq could not be reached for transcription.",
      );
    }

    if (response.status === 401 || response.status === 403) {
      return apiError(502, "TRANSCRIBE_AUTH_FAILED", "Groq rejected the API key.");
    }
    if (!response.ok) {
      return apiError(
        502,
        "TRANSCRIBE_UNAVAILABLE",
        `Groq transcription failed (HTTP ${response.status}).`,
      );
    }

    const payload = (await response.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text =
      typeof payload?.text === "string" ? payload.text.trim().slice(0, 1000) : "";
    if (!text) {
      return apiError(
        422,
        "NO_SPEECH",
        "No speech was recognized. Try again or type your list.",
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    return handleRouteError(error);
  }
}
