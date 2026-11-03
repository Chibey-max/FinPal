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
/** Current Groq vision model (Llama 4 Scout was retired / 404s). */
const VISION_MODEL = "qwen/qwen3.8-27b";
const PROMPT =
  "You help FinPal shop. Look at the product photo and reply with ONE short shopping list line only — product name plus useful details (brand, color, size, budget if obvious). No greeting, no markdown, no quotes. If the image is not a product, say what to buy in under 12 words.";

// POST /api/v1/agent/vision  multipart image
// Photo → short shopping need text (user still confirms before the agent shops).
export async function POST(request: Request) {
  const userId = await getApiUserId();
  if (!userId) return unauthorized();
  if (isRateLimited(`vision:${userId}`, 8, 60_000)) return rateLimited();

  try {
    const apiKey = getGroqEnv().GROQ_API_KEY;
    if (!apiKey) {
      return apiError(
        503,
        "VISION_UNAVAILABLE",
        "Snap search needs GROQ_API_KEY. Type or dictate your list instead.",
      );
    }

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      return apiError(400, "VALIDATION_ERROR", "Missing image file.");
    }
    if (image.size <= 0 || image.size > MAX_BYTES) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "Image must be between 1 byte and 4 MB.",
      );
    }
    const type = (image.type || "image/jpeg").toLowerCase();
    if (!type.startsWith("image/")) {
      return apiError(400, "VALIDATION_ERROR", "File must be an image.");
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const dataUrl = `data:${type};base64,${buffer.toString("base64")}`;

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          temperature: 0.2,
          max_completion_tokens: 120,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return apiError(
        503,
        "VISION_UNAVAILABLE",
        "Groq could not be reached for snap search.",
      );
    }

    const payload = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string };
    } | null;

    if (response.status === 401 || response.status === 403) {
      return apiError(502, "VISION_AUTH_FAILED", "Groq rejected the API key.");
    }
    if (!response.ok) {
      const detail = payload?.error?.message?.trim();
      return apiError(
        502,
        "VISION_UNAVAILABLE",
        detail
          ? `Snap search failed: ${detail}`
          : `Groq vision failed (HTTP ${response.status}).`,
      );
    }

    const text = payload?.choices?.[0]?.message?.content
      ?.trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 1000);
    if (!text) {
      return apiError(
        422,
        "NO_PRODUCT",
        "Could not read a product from that photo. Try another angle or type the list.",
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    return handleRouteError(error);
  }
}
