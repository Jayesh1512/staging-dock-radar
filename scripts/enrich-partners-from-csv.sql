-- Partner Enrichment from CSV (19 Mar 2026)
-- Updates discovered_companies with website, linkedin, linkedin_followers, and industries
-- Source: 19Mar2210 -Partner enrichment.csv (manually enriched by Ravi)
--
-- Run in Supabase SQL Editor.
-- Uses INSERT ... ON CONFLICT to handle both new and existing records.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 1: Add linkedin_followers column (if not exists)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE discovered_companies ADD COLUMN IF NOT EXISTS linkedin_followers INTEGER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 2: Upsert all companies from CSV
-- ═══════════════════════════════════════════════════════════════════════════════
-- normalized_name computed using same logic as company-normalize.ts:
--   lowercase → remove suffixes (inc,ltd,llc,gmbh,corp,corporation,solutions,
--   services,technologies,technology,systems,group,limited,co,plc,pty)
--   → strip punctuation → collapse whitespace
--
-- Industries: only included where CSV has a valid industry classification.
--   Rows with signal-type values (Deployment, Expansion, Partnership, Other)
--   or vague labels (Other Drone Distribution) get empty array — flagged in discrepancies.
--
-- ON CONFLICT: updates website/linkedin/followers only when CSV has non-null value,
--   preserving any existing data. Industries are replaced when CSV provides valid ones.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO discovered_companies (
  normalized_name, display_name, website, linkedin, linkedin_followers,
  industries, enriched_at, enriched_by, updated_at
) VALUES
  -- 1. 24/7 Drone Force (South Africa)
  ('247 drone force', '24/7 Drone Force',
   'https://24-7droneforce.co.za', NULL, 5600,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 2. ABTECH (USA)
  ('abtech', 'ABTECH',
   'https://abtech.com/', 'https://www.linkedin.com/company/abtech-usa', 660,
   '["Construction & Infrastructure"]'::jsonb, NOW(), 'manual', NOW()),

  -- 3. Aeronex FZCO (China / UAE) — industry "Deployment & Expansion" is signal type, skipped
  ('aeronex fzco', 'Aeronex FZCO',
   'https://www.aeronex.ae', 'https://ae.linkedin.com/company/aeronex-fzco', 4300,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 4. Agridrone PTY Ltd (South Africa) — normalized "Agriculture / Forestry" → "Agriculture & Forestry"
  ('agridrone', 'Agridrone PTY Ltd',
   'https://www.agridrone.co.za', NULL, NULL,
   '["Agriculture & Forestry"]'::jsonb, NOW(), 'manual', NOW()),

  -- 5. Airbox (UK) — CSV row was corrupted; extracted clean values
  ('airbox', 'Airbox',
   'https://www.airboxsystems.com', 'https://uk.linkedin.com/company/airbox-systems', 2020,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 6. AIRINS (Singapore) — industry "Other" skipped
  ('airins', 'AIRINS',
   'https://www.airins.com', 'https://sg.linkedin.com/company/airins', 500,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 7. Aloft Technologies (USA) — industry "Other Drone Distribution" skipped
  ('aloft', 'Aloft Technologies',
   'https://www.aloft.ai', 'https://www.linkedin.com/company/aloft-ai-inc', 6883,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 8. Amber Wings (India)
  ('amber wings', 'Amber Wings',
   'https://www.amberwings.co', 'https://in.linkedin.com/company/amber-wings-co', 4000,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 9. BlackSea Technologies (USA) — industry "Partnership / Training" is signal type, skipped
  ('blacksea', 'BlackSea Technologies',
   'https://blackseatechnologies.com', 'https://www.linkedin.com/company/blacksea-technologies', 8000,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 10. Cannon Dynamics (UK)
  ('cannon dynamics', 'Cannon Dynamics',
   'https://www.cannondynamics.co.uk', 'https://uk.linkedin.com/company/cannon-dynamics', 500,
   '["Defense & Security"]'::jsonb, NOW(), 'manual', NOW()),

  -- 11. DBOX (Lithuania)
  ('dbox', 'DBOX',
   'https://dbox.lt', 'https://www.linkedin.com/company/dbox-drone-in-a-box', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 12. Dexa (USA)
  ('dexa', 'Dexa',
   'https://www.flydexa.com', 'https://www.linkedin.com/company/flydexa', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 13. Drone Force (USA)
  ('drone force', 'Drone Force',
   'https://www.droneforcetech.com/', 'https://www.linkedin.com/company/drone-force-usa', 46,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 14. DroneCloud (UK)
  ('dronecloud', 'DroneCloud',
   'https://dronecloud.io', 'https://uk.linkedin.com/company/dronecloudhq', 1340,
   '["Construction & Infrastructure"]'::jsonb, NOW(), 'manual', NOW()),

  -- 15. EuroUSC Italia S.r.l. (Italy) — NOTE: LinkedIn slug is "unifly-consulting" (see discrepancies)
  ('eurousc italia srl', 'EuroUSC Italia S.r.l.',
   'https://www.eurousc.it', 'https://it.linkedin.com/company/unifly-consulting', 1000,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 16. Eye-bot Aerial Solutions (South Africa)
  ('eyebot aerial', 'Eye-bot Aerial Solutions',
   'https://www.eye-bot.com', 'https://www.linkedin.com/company/eye-bot-aerial-solutions', 2148,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 17. Falcon Unmanned Systems (USA)
  ('falcon unmanned', 'Falcon Unmanned Systems',
   'https://www.falconunmannedsystems.com', 'https://www.linkedin.com/company/falcon-unmanned-systems', 50,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 18. Fidelity Services Group (South Africa)
  ('fidelity', 'Fidelity Services Group',
   'https://www.fidelity-services.com', 'https://za.linkedin.com/company/fidelity-services-group', 86000,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 19. Flock Safety (USA)
  ('flock safety', 'Flock Safety',
   'https://www.flocksafety.com', 'https://www.linkedin.com/company/flock-', 92000,
   '["Perimeter Security & Smart Facilities"]'::jsonb, NOW(), 'manual', NOW()),

  -- 20. Fuvex (Spain)
  ('fuvex', 'Fuvex',
   'https://www.fuvex.com', 'https://www.linkedin.com/company/fuvex', 2400,
   '["Oil & Gas / Industrial Assets"]'::jsonb, NOW(), 'manual', NOW()),

  -- 21. Garuda Aerospace (India)
  ('garuda aerospace', 'Garuda Aerospace',
   'https://www.garudaaerospace.com', 'https://in.linkedin.com/company/garuda-aerospace-private-limited', 138000,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 22. GNSS AE (UAE) — industry "Deployment" is signal type, skipped
  ('gnss ae', 'GNSS AE',
   'https://www.gnss.ae', 'https://ae.linkedin.com/company/gnss-ae', 850,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 23. GS5 Systems (UK)
  ('gs5', 'GS5 Systems',
   'https://gs5.systems', 'https://www.linkedin.com/company/gs5-systems', 14,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 24. Heliboss Chile
  ('heliboss chile', 'Heliboss Chile',
   'https://heliboss.cl/', 'https://www.linkedin.com/company/dji-enterprise-heliboss-chile', 3040,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 25. Heliboss Mexico
  ('heliboss mexico', 'Heliboss Mexico',
   'https://heliboss.com', NULL, NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 26. heliguy (UK)
  ('heliguy', 'heliguy',
   'https://www.heliguy.com', 'https://www.linkedin.com/company/heliguy', 12581,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 27. Integrated Aerial Systems (South Africa)
  ('integrated aerial', 'Integrated Aerial Systems',
   'https://www.iasystems.co.za', 'https://za.linkedin.com/company/integrated-aerial-systems', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 28. ITG Technology Center (UAE) — industry "Deployment" skipped
  ('itg center', 'ITG Technology Center',
   'https://www.itg.es', 'https://www.linkedin.com/company/itg-technology-center', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 29. kioniq (Austria) — industry "Ski resorts" kept as-is (non-standard)
  ('kioniq', 'kioniq',
   'https://kioniq.com/', 'https://www.linkedin.com/company/kioniq', NULL,
   '["Ski resorts"]'::jsonb, NOW(), 'manual', NOW()),

  -- 30. Marut Drones (India) — merged with Marut Dronetech (same company, 2 CSV rows)
  ('marut drones', 'Marut Drones',
   'https://www.marutdrones.com', 'https://in.linkedin.com/company/marutdrones', 25559,
   '["Agriculture & Forestry", "Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 31. PHOTOSOL (France) — extracted from corrupted CSV row; industry "Deployment" skipped
  ('photosol', 'PHOTOSOL',
   'https://www.photosol.fr', 'https://www.linkedin.com/company/photosol-sas', 18111,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 32. PT Fusi Global Teknologi (Indonesia) — industry "Deployment" skipped
  ('pt fusi global teknologi', 'PT Fusi Global Teknologi',
   'https://fusi.co.id', 'https://www.linkedin.com/company/fusi-global-teknologi', 200,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 33. Revector (UK)
  ('revector', 'Revector',
   'https://www.revector.com', 'https://www.linkedin.com/company/revector/', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 34. SkyVisor (France) — industry "Deployment" skipped
  ('skyvisor', 'SkyVisor',
   'https://www.skyvisor.ai', 'https://www.linkedin.com/company/skyvisor', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 35. Team UAV (UK) — industry "Other" skipped
  ('team uav', 'Team UAV',
   'https://www.teamuav.uk', 'https://uk.linkedin.com/company/teamuav', 8200,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 36. Terra Drone Arabia (Saudi Arabia) — industry "Deployment" skipped
  ('terra drone arabia', 'Terra Drone Arabia',
   'https://terra-drone.com.sa', 'https://sa.linkedin.com/company/terra-drone-sa', 4700,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 37. Terra Drone Indonesia — industry "Other Drone Distribution" skipped
  ('terra drone indonesia', 'Terra Drone Indonesia',
   'https://terra-drone.co.id', 'https://id.linkedin.com/company/terradroneid', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 38. Unifly
  ('unifly', 'Unifly',
   'https://www.unifly.aero', 'https://www.linkedin.com/company/unifly-nv', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW()),

  -- 39. Versaterm (USA)
  ('versaterm', 'Versaterm',
   'https://www.versaterm.com', 'https://www.linkedin.com/company/versaterm-inc-', NULL,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 40. Volatus Aerospace (North America)
  ('volatus aerospace', 'Volatus Aerospace',
   'https://volatusaerospace.com', 'https://ca.linkedin.com/company/volatus-aerospace', 16700,
   '["Energy & Utilities"]'::jsonb, NOW(), 'manual', NOW()),

  -- 41. Vumacam (South Africa)
  ('vumacam', 'Vumacam',
   'https://www.vumacam.co.za', 'https://za.linkedin.com/company/vumacam01', NULL,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 42. ZenaTech (USA)
  ('zenatech', 'ZenaTech',
   'https://www.zenatech.com', 'https://ca.linkedin.com/company/zenatechinc', 2800,
   '["Construction & Infrastructure"]'::jsonb, NOW(), 'manual', NOW()),

  -- 43. Ubifly Technologies (India) — ePlane Company is parent; using parent's web presence
  ('ubifly', 'Ubifly Technologies',
   'https://www.eplane.ai', 'https://in.linkedin.com/company/the-eplane-company', NULL,
   '["Public Safety & Emergency Response"]'::jsonb, NOW(), 'manual', NOW()),

  -- 44. GURIS (Turkey) — corrected from encoding-broken "GÃRÄ°Å"
  ('guris', 'GURIS',
   'https://guristeknoloji.com', 'https://www.linkedin.com/company/guri%CC%87steknoloji%CC%87', NULL,
   '[]'::jsonb, NOW(), 'manual', NOW())

ON CONFLICT (normalized_name) DO UPDATE SET
  website = COALESCE(EXCLUDED.website, discovered_companies.website),
  linkedin = COALESCE(EXCLUDED.linkedin, discovered_companies.linkedin),
  linkedin_followers = COALESCE(EXCLUDED.linkedin_followers, discovered_companies.linkedin_followers),
  industries = CASE
    WHEN jsonb_array_length(EXCLUDED.industries) > 0 THEN EXCLUDED.industries
    ELSE discovered_companies.industries
  END,
  enriched_at = NOW(),
  enriched_by = 'manual',
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 3: Fix buyer entities misclassified as operator/si/partner in scored_articles
-- These buyers were appearing in Tab 2 hitlist due to wrong entity types
-- ═══════════════════════════════════════════════════════════════════════════════

-- Anji County: Chinese county government → buyer, not operator
UPDATE scored_articles
SET entities = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'name' ILIKE '%Anji County%' THEN jsonb_set(elem, '{type}', '"buyer"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text ILIKE '%Anji County%'
  AND entities::text LIKE '%"operator"%'
  AND relevance_score >= 50;

-- Austintown Fire Department: Fire department → buyer, not operator
UPDATE scored_articles
SET entities = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'name' ILIKE '%Austintown%' THEN jsonb_set(elem, '{type}', '"buyer"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(entities) AS elem
)
WHERE entities::text ILIKE '%Austintown%'
  AND relevance_score >= 50;

-- Also fix company field for articles where company = buyer name (prevents Tier 2 leak)
UPDATE scored_articles
SET company = NULL
WHERE company ILIKE '%Anji County%'
  AND relevance_score >= 50;

UPDATE scored_articles
SET company = NULL
WHERE company ILIKE '%Austintown Fire%'
  AND relevance_score >= 50;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 4: Verify results
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT normalized_name, display_name, website, linkedin, linkedin_followers, industries
FROM discovered_companies
WHERE enriched_by = 'manual'
ORDER BY display_name;
