/**
 * The address people reach the app on, for redirects. Inside the container a
 * route handler sees its bind address (0.0.0.0:10000), so the request's own
 * origin can't be used behind Render's proxy. Falls back to it when no public
 * URL is configured, as in local development.
 */
export function appOrigin(requestOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return configured ? new URL(configured).origin : requestOrigin;
}
