#!/usr/bin/env python3
"""
Country Registry Waterfall — Regional DSP Discovery

Downloads a country's full company registry, applies progressive filters,
scores companies by drone-service-provider likelihood, and outputs a CSV
ready for Supabase import.

Usage:
    python sirene_waterfall.py --country FR
    python sirene_waterfall.py --country FR --input /path/to/local.parquet
    python sirene_waterfall.py --country FR --top 100 --output custom_output.csv

Requirements:
    pip install pyarrow pandas pyyaml
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "config.yaml"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "output"


def load_config(country_code: str) -> dict:
    """Load country config from config.yaml."""
    with open(CONFIG_PATH) as f:
        cfg = yaml.safe_load(f)

    country = cfg.get("countries", {}).get(country_code)
    if not country:
        available = list(cfg.get("countries", {}).keys())
        print(f"Error: Country '{country_code}' not found in config.yaml")
        print(f"Available: {available}")
        sys.exit(1)

    return country


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_registry(config: dict, output_path: Path) -> Path:
    """Download the registry file if not already present."""
    url = config.get("download_url")
    if not url:
        print(f"Error: No download_url configured for {config['name']}.")
        print("Provide the file manually with --input.")
        sys.exit(1)

    fmt = config.get("format", "parquet")
    local_file = output_path / f"registry_{config['name'].lower().replace(' ', '_')}.{fmt}"

    if local_file.exists():
        size_mb = local_file.stat().st_size / (1024 * 1024)
        print(f"Registry file already exists: {local_file} ({size_mb:.0f} MB)")
        return local_file

    print(f"Downloading {config['name']} registry ({fmt})...")
    print(f"  URL: {url}")
    result = subprocess.run(
        ["curl", "-L", "--progress-bar", "-o", str(local_file), url],
        capture_output=False,
    )
    if result.returncode != 0:
        print("Download failed.")
        sys.exit(1)

    size_mb = local_file.stat().st_size / (1024 * 1024)
    print(f"Downloaded: {local_file} ({size_mb:.0f} MB)")
    return local_file


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------

def load_registry(file_path: Path, config: dict) -> "Iterator":
    """
    Load registry as an iterator of pandas DataFrames (batched).
    For parquet: uses pyarrow batch reader (memory-efficient).
    For CSV: uses pandas chunked reader.
    """
    import pyarrow.parquet as pq

    col_map = config["columns"]
    needed_cols = [v for v in col_map.values() if v]

    fmt = config.get("format", "parquet")

    if fmt == "parquet":
        pf = pq.ParquetFile(str(file_path))
        total_rows = pf.metadata.num_rows
        print(f"Registry: {total_rows:,} total entities")

        # Validate columns exist
        schema_names = set(pf.schema.names)
        missing = [c for c in needed_cols if c not in schema_names]
        if missing:
            print(f"Warning: columns not found in parquet: {missing}")
            needed_cols = [c for c in needed_cols if c in schema_names]

        for batch in pf.iter_batches(batch_size=500_000, columns=needed_cols):
            yield batch.to_pandas(), total_rows

    elif fmt == "csv":
        sep = config.get("csv_separator", ",")
        enc = config.get("csv_encoding", "utf-8")
        # Count total lines first
        total_rows = sum(1 for _ in open(file_path, encoding=enc)) - 1
        print(f"Registry: {total_rows:,} total entities")

        for chunk in pd.read_csv(
            file_path, sep=sep, encoding=enc,
            usecols=needed_cols, chunksize=500_000,
            low_memory=False, dtype=str,
        ):
            yield chunk, total_rows
    else:
        print(f"Error: Unsupported format '{fmt}'")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Waterfall Stages
# ---------------------------------------------------------------------------

def build_search_text(df: pd.DataFrame, config: dict) -> pd.Series:
    """Combine all name fields into a single lowercase search string."""
    col_map = config["columns"]
    name_cols = ["company_name", "trade_name_1", "trade_name_2", "trade_name_3", "acronym"]
    parts = []
    for key in name_cols:
        col = col_map.get(key)
        if col and col in df.columns:
            parts.append(df[col].fillna("").astype(str))
    if not parts:
        return pd.Series([""] * len(df), index=df.index)
    combined = parts[0]
    for p in parts[1:]:
        combined = combined + " " + p
    return combined.str.lower()


def stage1_active(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Keep only active companies."""
    col = config["columns"].get("status")
    val = config.get("active_status_value", "A")
    if col and col in df.columns:
        return df[df[col] == val]
    return df


def stage2_drone_keyword(search_text: pd.Series, config: dict) -> pd.Series:
    """Substring match on drone-related keywords. Returns boolean mask."""
    keywords = config.get("drone_keywords", ["drone"])
    pattern = "|".join(keywords)
    return search_text.str.contains(pattern, case=False, na=False, regex=True)


def stage3_activity_blacklist(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Remove companies in blacklisted activity sectors."""
    col = config["columns"].get("activity_code")
    blacklist = config.get("activity_code_blacklist", [])
    if not col or col not in df.columns or not blacklist:
        return df

    def is_ok(code):
        if pd.isna(code) or not code:
            return True
        c = str(code)
        return not any(c.startswith(p) for p in blacklist)

    return df[df[col].apply(is_ok)]


def stage4_age(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Keep companies older than threshold."""
    col = config["columns"].get("created_date")
    cutoff = config.get("min_created_before", "2025-01-01")
    if not col or col not in df.columns:
        return df
    created = pd.to_datetime(df[col], errors="coerce")
    return df[(created.isna()) | (created < cutoff)]


def stage5_exclude(search_text: pd.Series, config: dict) -> pd.Series:
    """Returns boolean mask — True = keep, False = exclude."""
    patterns = config.get("exclude_patterns", [])
    if not patterns:
        return pd.Series([True] * len(search_text), index=search_text.index)
    mask = pd.Series([True] * len(search_text), index=search_text.index)
    for pat in patterns:
        mask = mask & ~search_text.str.contains(pat, case=False, na=False)
    return mask


def stage6_score(df: pd.DataFrame, search_text: pd.Series, config: dict) -> pd.Series:
    """Compute composite score for each company."""
    scoring = config.get("scoring", {})
    col_map = config["columns"]

    emp_scores = scoring.get("employee_band_scores", {})
    cat_scores = scoring.get("category_scores", {})
    age_tiers = scoring.get("age_scores", [])
    legal_scores = scoring.get("legal_form_scores", {})
    premium_naf = scoring.get("premium_activity_codes", {})
    svc_kw = scoring.get("service_keywords", [])
    tech_kw = scoring.get("tech_keywords", [])
    penalties = scoring.get("penalties", [])
    emp_bonus = scoring.get("has_employees_bonus", 3)
    has_emp_val = config.get("has_employees_value", "O")

    scores = pd.Series([0] * len(df), index=df.index, dtype=int)

    # Employee band
    emp_col = col_map.get("employee_band")
    if emp_col and emp_col in df.columns:
        scores += df[emp_col].map(lambda v: emp_scores.get(str(v) if pd.notna(v) else "NN", 0))

    # Has employees flag
    has_emp_col = col_map.get("has_employees")
    if has_emp_col and has_emp_col in df.columns:
        scores += (df[has_emp_col] == has_emp_val).astype(int) * emp_bonus

    # Company category
    cat_col = col_map.get("company_category")
    if cat_col and cat_col in df.columns:
        scores += df[cat_col].map(lambda v: cat_scores.get(str(v) if pd.notna(v) else "", 0))

    # Company age
    created_col = col_map.get("created_date")
    if created_col and created_col in df.columns:
        created = pd.to_datetime(df[created_col], errors="coerce")
        age_years = (pd.Timestamp.now() - created).dt.days / 365.25
        for tier in sorted(age_tiers, key=lambda t: t["min_years"], reverse=True):
            scores += (age_years >= tier["min_years"]).astype(int) * tier["points"]
            # Only highest matching tier should apply — break after first match
            # Actually the tiers are cumulative in the original; let's keep first-match
            break  # Remove this break if tiers should be cumulative

        # Re-do properly: highest matching tier only
        scores_age = pd.Series([0] * len(df), index=df.index)
        for _, row_age in zip(range(len(df)), age_years):
            pass  # vectorized approach below

        # Vectorized: apply highest matching tier
        scores_age = pd.Series([0] * len(df), index=df.index)
        for tier in sorted(age_tiers, key=lambda t: t["min_years"], reverse=True):
            mask = (age_years >= tier["min_years"]) & (scores_age == 0)
            scores_age[mask] = tier["points"]
        scores += scores_age

    # Legal form prefix
    legal_col = col_map.get("legal_form")
    if legal_col and legal_col in df.columns:
        for prefix, pts in legal_scores.items():
            scores += df[legal_col].fillna("").astype(str).str.startswith(prefix).astype(int) * pts

    # Premium activity codes
    act_col = col_map.get("activity_code")
    if act_col and act_col in df.columns:
        scores += df[act_col].map(lambda v: premium_naf.get(str(v) if pd.notna(v) else "", 0))

    # Service keywords in name
    for kw in svc_kw:
        scores += search_text.str.contains(kw, case=False, na=False).astype(int) * 4

    # Tech keywords in name
    for kw in tech_kw:
        scores += search_text.str.contains(kw, case=False, na=False).astype(int) * 2

    # Penalties
    for pen in penalties:
        kws = pen.get("keywords", [])
        exclude_if = pen.get("exclude_if_also", [])
        pts = pen.get("points", 0)
        for kw in kws:
            hit = search_text.str.contains(kw, case=False, na=False)
            if exclude_if:
                # Don't penalize if also contains the exclude term
                for ex in exclude_if:
                    hit = hit & ~search_text.str.contains(ex, case=False, na=False)
            scores += hit.astype(int) * pts

    return scores


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------

def run_waterfall(country_code: str, input_file: str = None, top_n: int = None, output_file: str = None):
    start = time.time()
    config = load_config(country_code)
    print(f"\n{'='*70}")
    print(f"Country Registry Waterfall — {config['name']} ({country_code})")
    print(f"{'='*70}\n")

    # Download or use provided file
    output_dir = DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    if input_file:
        registry_path = Path(input_file)
        if not registry_path.exists():
            print(f"Error: File not found: {input_file}")
            sys.exit(1)
    else:
        registry_path = download_registry(config, output_dir)

    # Process in batches
    all_candidates = []
    total_scanned = 0
    total_active = 0

    for df_batch, total_rows in load_registry(registry_path, config):
        total_scanned += len(df_batch)

        # Stage 1: Active
        df_active = stage1_active(df_batch, config)
        total_active += len(df_active)

        # Stage 2: Drone keyword substring match
        search_text = build_search_text(df_active, config)
        drone_mask = stage2_drone_keyword(search_text, config)
        matches = df_active[drone_mask].copy()

        if len(matches) > 0:
            matches["_search_text"] = search_text[drone_mask].values
            all_candidates.append(matches)

        if total_scanned % 2_000_000 == 0:
            n_found = sum(len(c) for c in all_candidates)
            print(f"  Scanned {total_scanned:>12,} / {total_rows:,}  |  Drone matches: {n_found:,}")

    if not all_candidates:
        print("\nNo drone-related companies found. Check keywords in config.yaml.")
        sys.exit(0)

    df = pd.concat(all_candidates, ignore_index=True)
    n_stage2 = len(df)
    print(f"\nStage 1 (active):         {total_active:>8,}  (from {total_scanned:,} total)")
    print(f"Stage 2 (drone keyword):  {n_stage2:>8,}")

    # Stage 3: Activity code blacklist
    df = stage3_activity_blacklist(df, config)
    print(f"Stage 3 (NAF blacklist):  {len(df):>8,}  (dropped {n_stage2 - len(df)})")

    # Stage 4: Age
    n_pre4 = len(df)
    df = stage4_age(df, config)
    print(f"Stage 4 (age filter):     {len(df):>8,}  (dropped {n_pre4 - len(df)})")

    # Stage 5: Exclude patterns
    n_pre5 = len(df)
    keep_mask = stage5_exclude(df["_search_text"], config)
    df = df[keep_mask].copy()
    print(f"Stage 5 (exclusions):     {len(df):>8,}  (dropped {n_pre5 - len(df)})")

    # Stage 6: Score
    df["_score"] = stage6_score(df, df["_search_text"], config)
    df = df.sort_values("_score", ascending=False).reset_index(drop=True)
    print(f"Stage 6 (scored):         {len(df):>8,}")

    # Build output DataFrame
    col_map = config["columns"]
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def safe_col(name):
        col = col_map.get(name)
        if col and col in df.columns:
            return df[col]
        return pd.Series([None] * len(df), index=df.index)

    output = pd.DataFrame({
        "siren": safe_col("siren"),
        "company_name": safe_col("company_name"),
        "trade_name": safe_col("trade_name_1"),
        "acronym": safe_col("acronym"),
        "naf_code": safe_col("activity_code"),
        "legal_form_code": safe_col("legal_form"),
        "employee_band": safe_col("employee_band"),
        "has_employees": safe_col("has_employees").map(
            lambda v: True if v == config.get("has_employees_value", "O") else False
        ),
        "company_category": safe_col("company_category"),
        "created_date": safe_col("created_date"),
        "composite_score": df["_score"],
        "rank": range(1, len(df) + 1),
        "region": country_code,
        "signal_source": "sirene_bulk_db",
        "filter_version": "waterfall_v1",
        "extracted_at": now,
        "notes": None,
    })

    # Print top N
    show_n = min(top_n or 50, len(output))
    print(f"\n{'='*100}")
    print(f"TOP {show_n} DSP CANDIDATES — {config['name']}")
    print(f"{'='*100}")
    print(f"{'#':>4} {'Sc':>4} {'Company Name':<45} {'NAF':>7} {'Emp':>4} {'Cat':>4} {'Created':<11}")
    print("-" * 100)
    for _, row in output.head(show_n).iterrows():
        name = str(row["company_name"] or "")[:44]
        print(f"{row['rank']:>4} {row['composite_score']:>4} {name:<45} "
              f"{str(row['naf_code'] or '?'):>7} {str(row['employee_band'] or '?'):>4} "
              f"{str(row['company_category'] or '?'):>4} {str(row['created_date'] or '?')[:10]:<11}")

    # Score distribution
    print(f"\nScore distribution ({len(output)} total):")
    print(f"  ≥ 30: {len(output[output['composite_score'] >= 30]):>5}  (hot)")
    print(f"  20-29: {len(output[(output['composite_score'] >= 20) & (output['composite_score'] < 30)]):>4}  (warm)")
    print(f"  10-19: {len(output[(output['composite_score'] >= 10) & (output['composite_score'] < 20)]):>4}  (cool)")
    print(f"  < 10: {len(output[output['composite_score'] < 10]):>5}  (cold)")

    # Save
    if output_file:
        out_path = Path(output_file)
    else:
        out_path = output_dir / f"drone_companies_{country_code.lower()}.csv"

    if top_n:
        output.head(top_n).to_csv(out_path, index=False)
    else:
        output.to_csv(out_path, index=False)

    print(f"\nSaved: {out_path} ({len(output) if not top_n else min(top_n, len(output))} rows)")
    print(f"Total time: {time.time() - start:.1f}s")
    print(f"{'='*100}")

    return output


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Country Registry Waterfall — Discover drone service providers from national company databases"
    )
    parser.add_argument(
        "--country", "-c", required=True,
        help="Country code (e.g., FR, UK, DE). Must exist in config.yaml."
    )
    parser.add_argument(
        "--input", "-i", default=None,
        help="Path to local registry file (parquet/csv). Skips download if provided."
    )
    parser.add_argument(
        "--top", "-n", type=int, default=None,
        help="Only output top N records (default: all filtered records)."
    )
    parser.add_argument(
        "--output", "-o", default=None,
        help="Output CSV path (default: output/drone_companies_{country}.csv)."
    )
    args = parser.parse_args()

    run_waterfall(
        country_code=args.country.upper(),
        input_file=args.input,
        top_n=args.top,
        output_file=args.output,
    )


if __name__ == "__main__":
    main()
