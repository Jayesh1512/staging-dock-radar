#!/bin/bash

# fetch_sirene_step6.sh
# Fetches all active companies in drone NAF codes, headcount >= 1
# Created 2020 onwards (last 6 years)

# Load API key from .env.local
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local not found in current directory"
  exit 1
fi

export $(cat .env.local | grep SIRENE_API_KEY | xargs)

if [ -z "$SIRENE_API_KEY" ]; then
  echo "❌ Error: SIRENE_API_KEY not found in .env.local"
  exit 1
fi

echo "✅ API Key loaded"
echo "🔍 Querying SIRENE for drone sector companies (2020+)..."

# Build the query string
QUERY='periode(activitePrincipaleUniteLegale:(71.12B OR 30.30Z OR 58.29C OR 47.43Z OR 82.99Z OR 85.59A OR 59.11B) AND etatAdministratifUniteLegale:A) AND (trancheEffectifsUniteLegale:(01 OR 02 OR 03 OR 11 OR 12)) AND dateCreationUniteLegale:[2020-01-01 TO 2026-12-31]'

# URL encode the query
ENCODED_QUERY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$QUERY'''))")

# First batch
echo "📥 Fetching batch 1..."
curl -s -X GET \
  "https://api.insee.fr/api-sirene/3.11/siren?q=${ENCODED_QUERY}&nombre=1000&curseur=*" \
  -H "Authorization: Bearer $SIRENE_API_KEY" \
  -H "X-INSEE-Api-Key-Integration: $SIRENE_API_KEY" \
  -H 'Accept: application/json' \
  | jq -c '.unitesLegales[] | {siren: .siren, name: .denominationUniteLegale, naf: .activitePrincipaleUniteLegale, headcount: .trancheEffectifsUniteLegale, siteWeb: .siteWeb, creationDate: .dateCreationUniteLegale}' \
  > step6_batch1.jsonl

# Check if there's a next page
NEXT_CURSOR=$(curl -s -X GET \
  "https://api.insee.fr/api-sirene/3.11/siren?q=${ENCODED_QUERY}&nombre=1000&curseur=*" \
  -H "Authorization: Bearer $SIRENE_API_KEY" \
  -H "X-INSEE-Api-Key-Integration: $SIRENE_API_KEY" \
  -H 'Accept: application/json' \
  | jq -r '.header.curseurSuivant // empty')

# If there are more results, fetch subsequent batches
BATCH_NUM=2
while [ ! -z "$NEXT_CURSOR" ]; do
  echo "📥 Fetching batch $BATCH_NUM..."
  curl -s -X GET \
    "https://api.insee.fr/api-sirene/3.11/siren?q=${ENCODED_QUERY}&nombre=1000&curseur=${NEXT_CURSOR}" \
    -H "Authorization: Bearer $SIRENE_API_KEY" \
    -H "X-INSEE-Api-Key-Integration: $SIRENE_API_KEY" \
    -H 'Accept: application/json' \
    | jq -c '.unitesLegales[] | {siren: .siren, name: .denominationUniteLegale, naf: .activitePrincipaleUniteLegale, headcount: .trancheEffectifsUniteLegale, siteWeb: .siteWeb, creationDate: .dateCreationUniteLegale}' \
    >> step6_batch1.jsonl
  
  # Get next cursor
  NEXT_CURSOR=$(curl -s -X GET \
    "https://api.insee.fr/api-sirene/3.11/siren?q=${ENCODED_QUERY}&nombre=1000&curseur=${NEXT_CURSOR}" \
    -H "Authorization: Bearer $SIRENE_API_KEY" \
    -H "X-INSEE-Api-Key-Integration: $SIRENE_API_KEY" \
    -H 'Accept: application/json' \
    | jq -r '.header.curseurSuivant // empty')
  
  BATCH_NUM=$((BATCH_NUM + 1))
done

# Count results
TOTAL=$(wc -l < step6_batch1.jsonl)
echo "✅ Fetch complete!"
echo "📊 Total companies found: $TOTAL"
echo "📁 Results saved to: step6_batch1.jsonl"
