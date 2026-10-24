/**
 * Removes a one-time token from the visible URL and the current history entry.
 *
 * Verification and reset links arrive as `?token=…`. Once the token has been captured
 * into component state it must not linger in the address bar: the URL ends up in
 * browser history, screenshots and any same-origin referrer that is not suppressed.
 */
export function scrubOneTimeTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}
