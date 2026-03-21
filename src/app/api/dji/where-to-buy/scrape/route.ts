import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { DjiVendorKind } from '@/lib/dji/whereToBuyScraper';
import { scrapeDjiWhereToBuy } from '@/lib/dji/whereToBuyScraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveRepoRoot(): string {
  const cwdRoot = process.cwd();
  const cwdCandidate = path.join(cwdRoot, 'data', 'dji-where-to-buy-country-codes.json');
  if (fs.existsSync(cwdCandidate)) return cwdRoot;

  // File: <repoRoot>/src/app/api/dji/where-to-buy/scrape/route.ts
  const dirnameRoot = path.resolve(__dirname, '../../../../../../');
  const dirnameCandidate = path.join(dirnameRoot, 'data', 'dji-where-to-buy-country-codes.json');
  if (fs.existsSync(dirnameCandidate)) return dirnameRoot;

  return cwdRoot;
}

const REPO_ROOT = resolveRepoRoot();
const DATA_DIR = path.join(REPO_ROOT, 'data');
function getCacheFilename(args: { mode: 'sample' | 'all'; includeKinds?: DjiVendorKind[] }): string {
  const kinds = args.includeKinds?.slice().sort() ?? [];
  const key = `${args.mode}:${kinds.join('|') || 'ALL_DEFAULTS'}`;
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `dji-where-to-buy-snapshot-${args.mode}-${hash}.json`;
}

function isFreshFile(filePath: string, maxAgeMs: number): boolean {
  try {
    const st = fs.statSync(filePath);
    const age = Date.now() - st.mtimeMs;
    return age <= maxAgeMs;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: 'sample' | 'all';
    maxCountriesPerContinent?: number;
    includeKinds?: DjiVendorKind[];
    force?: boolean;
  };

  const mode = body.mode ?? 'sample';
  const force = body.force ?? false;
  const snapshotPath = path.join(DATA_DIR, getCacheFilename({ mode, includeKinds: body.includeKinds }));
  const maxCountriesPerContinent = body.maxCountriesPerContinent ?? (mode === 'sample' ? 5 : 9999);

  // Reuse cached snapshot for full runs.
  if (mode === 'all' && !force && isFreshFile(snapshotPath, 6 * 60 * 60 * 1000)) {
    const cached = fs.readFileSync(snapshotPath, 'utf8');
    return NextResponse.json({ cached: true, snapshot: JSON.parse(cached) });
  }

  const snapshotStartedAt = new Date().toISOString();
  try {
    const snapshot = await scrapeDjiWhereToBuy({
      mode,
      maxCountriesPerContinent,
      includeKinds: body.includeKinds,
    });

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      generatedAt: snapshotStartedAt,
      mode,
      includeKinds: body.includeKinds ?? undefined,
      summary: snapshot.summary,
      vendors: snapshot.vendors,
    };

    fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2), 'utf8');

    return NextResponse.json({ cached: false, snapshot: payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to scrape DJI partners';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

