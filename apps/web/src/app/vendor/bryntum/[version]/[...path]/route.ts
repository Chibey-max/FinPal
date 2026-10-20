import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BRYNTUM_FILES,
  BRYNTUM_VERSION,
} from "@/features/calendar/bryntum-assets";

// GET /vendor/bryntum/:version/:path
// Serves Bryntum's prebuilt files straight from the installed package (see
// bryntum-assets.ts for why it is not bundled). Only allow-listed paths are
// served, so nothing else under node_modules can be read.
const ROOT = join(process.cwd(), "node_modules/@bryntum/calendar");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; path: string[] }> },
) {
  const { version, path } = await params;
  const file = path.join("/");
  const contentType = BRYNTUM_FILES[file];
  if (version !== BRYNTUM_VERSION || !contentType) {
    return new Response("Not found", { status: 404 });
  }
  const body = await readFile(join(ROOT, file));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      // The version is in the URL, so the file at it never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
