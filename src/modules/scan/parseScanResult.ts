// Validates raw QR content and reduces it to a safe in-app path.
// Only venue URLs (/l/city/neighborhood/spot) are accepted, and only the
// scan token is carried over — everything else in the QR is discarded.
export function parseScanResult(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim(), 'https://placeholder.invalid');
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!/^\/l\/[\w-]+\/[\w-]+\/[\w-]+$/.test(url.pathname)) return null;

  const token = url.searchParams.get('t');
  return url.pathname + (token ? `?t=${encodeURIComponent(token)}` : '');
}
