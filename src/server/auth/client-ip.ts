// The first x-forwarded-for entries are client-controlled; only the last one is appended by our proxy hop.
export function clientIp(headers: Headers): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwarded?.length) return forwarded[forwarded.length - 1];
  return headers.get("x-real-ip")?.trim() || "unknown";
}
