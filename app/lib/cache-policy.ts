export const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function applyNoStoreHeaders(headers: Headers) {
  for (const [key, value] of Object.entries(noStoreHeaders)) {
    headers.set(key, value);
  }
  return headers;
}
