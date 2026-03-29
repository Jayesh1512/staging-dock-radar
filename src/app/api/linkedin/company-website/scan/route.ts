import { NextResponse } from "next/server";
import { requireSupabase } from "@/lib/db";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function countRegexOccurrences(html: string, re: RegExp): number {
  // Ensure the regex behaves consistently across multiple calls (global + match).
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const normalized = new RegExp(re.source, flags);
  const matches = html.match(normalized);
  return matches?.length ?? 0;
}

function normalizeWebsiteUrl(input: string): string | null {
  const t = String(input || "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function slugFromWebsiteUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return url.toLowerCase();
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { websiteUrls?: string[] };
    const websiteUrls = Array.isArray(body.websiteUrls) ? body.websiteUrls : [];
    const cleanUrls = websiteUrls.map(normalizeWebsiteUrl).filter((u): u is string => Boolean(u));

    if (cleanUrls.length === 0) {
      return NextResponse.json({ error: "websiteUrls must be a non-empty array" }, { status: 400 });
    }

    const runId = `run_web_scan_${new Date().toISOString().replace(/[:.TZ-]/g, "").slice(0, 15)}`;
    const scannedAt = new Date().toISOString();
    const db = requireSupabase();

    // Regexes based on the same intent as LinkedIn posts scanning.
    const RE_DJI = /\bdji\b/gi;
    const RE_DJI_DOCK = /dji\s*dock/gi;
    const RE_DOCK = /\bdock\b/gi;
    const RE_DIAB = /drone\.in\.a\.box/i;

    const rows: Array<{
      slug: string;
      posts_scraped: number;
      dock_matches: number;
      dji_count: number;
      dock_count: number;
      diab_count: number;
      batch: string | null;
      run_id: string;
      scanned_at: string;
    }> = [];

    // Sequential crawling to reduce load and avoid rate limiting.
    for (const url of cleanUrls) {
      const slug = slugFromWebsiteUrl(url);
      let posts_scraped = 0;

      let html = "";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25_000);

        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        html = await res.text();
        // Use cheerio to ensure we operate on a consistent DOM-extracted HTML string.
        const $ = cheerio.load(html);
        html = $.html();
        posts_scraped = html ? 1 : 0;
      } catch (e) {
        // Still write a row so it appears in scan history.
        posts_scraped = 0;
      }

      const djiCount = html ? countRegexOccurrences(html, RE_DJI) : 0;
      const djiDockCount = html ? countRegexOccurrences(html, RE_DJI_DOCK) : 0;
      const dockCount = html ? countRegexOccurrences(html, RE_DOCK) : 0;
      const diabCount = html ? countRegexOccurrences(html, RE_DIAB) : 0;

      rows.push({
        slug,
        posts_scraped,
        // We reuse dock_matches field for DJI Dock occurrences on the website.
        dock_matches: djiDockCount,
        dji_count: djiCount,
        dock_count: dockCount,
        diab_count: diabCount,
        batch: null,
        run_id: runId,
        scanned_at: scannedAt,
      });
    }

    await db.from("dji_resellers_linkedin_scan_log").insert(rows);

    return NextResponse.json({
      runId,
      count: rows.length,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Website scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

