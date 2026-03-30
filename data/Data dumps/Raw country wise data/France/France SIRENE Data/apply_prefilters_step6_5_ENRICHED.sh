#!/bin/bash

# apply_prefilters_step6_5_ENRICHED.sh
# Updated version that handles SIRENE V3.11 API limitation (missing siteWeb)
# Uses enriched data from enrich_websites.js to populate missing websites

echo "🔍 Applying pre-filters to Step 6 results..."
echo ""

# Check if enriched file exists, otherwise use original
INPUT_FILE="step6_batch1.jsonl"

if [ -f "step6_batch1_enriched.jsonl" ]; then
  echo "📂 Found enriched dataset (step6_batch1_enriched.jsonl)"
  echo "   Using enriched websites to fill SIRENE gaps..."
  INPUT_FILE="step6_batch1_enriched.jsonl"
else
  echo "⚠️  No enriched dataset found."
  echo "   To enrich missing websites, run:"
  echo "   → npm install axios"
  echo "   → node enrich_websites.js"
  echo ""
  echo "   Proceeding with original SIRENE data..."
  echo "   (Note: Many companies may have null siteWeb)"
  echo ""
fi

# Count input
TOTAL_INPUT=$(wc -l < "$INPUT_FILE")

# Apply filter: keep only companies with non-null, non-empty siteWeb
jq -r "select(
  (.siteWeb != null and .siteWeb != \"\")
)" "$INPUT_FILE" > step6_5_with_website.jsonl

TOTAL_OUTPUT=$(wc -l < step6_5_with_website.jsonl)
FILTERED_OUT=$((TOTAL_INPUT - TOTAL_OUTPUT))
PERCENTAGE=$((TOTAL_OUTPUT * 100 / TOTAL_INPUT))

echo "✅ Pre-filter results:"
echo "   Input (Step 6):                    $TOTAL_INPUT companies"
echo "   Output (Step 6.5 with website):    $TOTAL_OUTPUT companies"
echo "   Filtered out (no website):         $FILTERED_OUT companies"
echo "   Keep rate:                         $PERCENTAGE%"
echo ""
echo "📁 Filtered results saved to: step6_5_with_website.jsonl"
echo ""

# Show sample of output
echo "📊 Sample companies (first 3):"
jq -r '.siren, .name, .siteWeb, .siteWeb_source' step6_5_with_website.jsonl | head -12 | paste -d " " - - - - | awk '{printf "   SIREN: %-12s | Name: %-30s | Website: %-25s | Source: %s\n", $1, $2, $3, $4}'

echo ""
echo "✨ Next step: Run the website crawler"
echo "   node crawl_dji_dock_exact.js"
