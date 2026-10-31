// Runs once when a server instance starts, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrateOnStart } = await import("@/lib/migrate-on-start");
  await migrateOnStart();
}
