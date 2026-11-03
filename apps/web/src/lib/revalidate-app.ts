import { revalidatePath } from "next/cache";

/** Drop cached /app RSC payloads after a mutation so the next load is fresh. */
export function revalidateApp() {
  revalidatePath("/app", "layout");
}
