/**
 * Full HTML fetch for scripts (e.g. CASA filter) — not the 1k-char capped crawlUrl().
 */

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchHtmlPage(
  url: string,
  opts?: { timeoutMs?: number; userAgent?: string },
): Promise<string | null> {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return null;

  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const ua = opts?.userAgent ?? DEFAULT_UA;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(u, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    clearTimeout(timer);

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return null;
    }
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
