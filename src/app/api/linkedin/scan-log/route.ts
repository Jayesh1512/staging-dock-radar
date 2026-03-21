import { NextResponse } from "next/server";
import { requireSupabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = requireSupabase();
    const { data, error } = await db
      .from("dji_resellers_linkedin_scan_log")
      .select("id, slug, posts_scraped, dock_matches, dji_count, dock_count, diab_count, batch, run_id, scanned_at")
      .order("dock_matches", { ascending: false })
      .order("posts_scraped", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return NextResponse.json({ rows: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch scan log" },
      { status: 500 },
    );
  }
}
