# DB Entity Corrections Log

All manual entity type corrections made to `scored_articles.entities[]` via Claude Code agent.

## Format
| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|

## Session 1 — 2026-03-19 (Initial entity audit)

| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|
| 2026-03-19 | scored_article_1773766244736_16 | Drone Force | partner | operator | Commercial DSP offering drone patrol services | Claude Code |
| 2026-03-19 | scored_article_1773764127831_16 | Flock Safety | oem | si | Maker-operator hybrid: manufactures AND deploys commercially | Claude Code |
| 2026-03-19 | scored_article_1773764127831_21 | Flock Safety | (missing) | si | Added si entity — was absent from entities[] | Claude Code |
| 2026-03-19 | scored_article_1773764127831_17 | Flock Safety | oem | si | Maker-operator hybrid | Claude Code |
| 2026-03-19 | scored_article_1773764127831_17 | Prosper | operator | buyer | Police dept = end-user, not DSP | Claude Code |
| 2026-03-19 | scored_article_1773765627386_27 | ZenaTech Inc. | oem | operator | Maker-operator hybrid (changed before si rule finalized) | Claude Code |
| 2026-03-19 | scored_article_1773767630449_27 | ZenaTech | buyer | operator | Commercially deploys drone services | Claude Code |
| 2026-03-19 | scored_article_1773766244736_21 | ZenaTech | (missing) | operator | Added operator entity — was empty entities[] | Claude Code |
| 2026-03-19 | scored_article_1773764979364_31 | Volatus Aerospace Inc. | (missing) | si | Added si entity — company field had it but entities[] didn't | Claude Code |
| 2026-03-19 | scored_li_run_*_2 | Changsha City | operator | buyer | Government end-user, not DSP | Claude Code |
| 2026-03-19 | scored_li_run_*_2 | Aeronex | partner | si | DJI master reseller + commercial drone deployer | Claude Code |
| 2026-03-19 | scored_li_run_*_81 | Jiliao Expressway | operator | buyer | Infrastructure end-user, not DSP | Claude Code |
| 2026-03-19 | scored_li_run_*_6 | Nokia | operator | oem | Telecom OEM, not drone service provider | Claude Code |
| 2026-03-19 | scored_article_1773767630449_29 | Marut Drones | oem | si | Maker-operator hybrid: manufactures AND deploys services | Claude Code |
| 2026-03-19 | scored_article_1773767630449_1 | NPAS | operator | buyer | Police air service = government end-user | Claude Code |
| 2026-03-19 | scored_li_run_*_65 | Unnamed Solar PV Facility | operator | buyer | End-user facility, not DSP | Claude Code |
| 2026-03-19 | (PT Alita article) | PT Alita Praya Mitra | kept buyer | buyer | Confirmed buyer; added si:PT Fusi Global Teknologi | Claude Code |
| 2026-03-19 | (DroneBase article) | DroneBase | partner | si | Commercial drone inspection firm | Claude Code |
| 2026-03-19 | (DroneBase article) | FlytBase | (removed) | — | Our own platform, must never appear in entities | Claude Code |
| 2026-03-19 | (Dubai Holding article) | Dubai Holding | operator | buyer | Real estate end-user, not DSP | Claude Code |
| 2026-03-19 | (Planai article) | Planai-Hochwurzen-Bahnen | operator | buyer | Ski resort end-user, not DSP | Claude Code |

## Session 2 — 2026-03-19 (8 targeted fixes — applied)

| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|
| 2026-03-19 | scored_article_…_1773764354555 | Ubifly Technologies | other | si | Commercial drone company | Claude Code |
| 2026-03-19 | scored_article_…_1773765760942 | heliguy™ | partner | si | DJI Enterprise dealer + drone service provider | Claude Code |
| 2026-03-19 | scored_li_run_…_1773905663306 | Aerial Prospex | partner | si | Aerial survey/inspection DSP | Claude Code |
| 2026-03-19 | scored_article_…_1773765716465 | Terra Drone Indonesia | partner | si | Terra Drone subsidiary, commercial drone services | Claude Code |
| 2026-03-19 | scored_article_…_1773767963185 | EuroUSC Italia S.r.l. | partner | si | Aviation safety consultancy + drone services | Claude Code |
| 2026-03-19 | scored_article_…_1773653952573 | AIRINS | partner | si | Drone service provider | Claude Code |
| 2026-03-19 | scored_li_run_…_1773906348733 | High-Lander | partner | si | Competitor (also added to OEM_NAMES exclusion) | Claude Code |
| 2026-03-19 | scored_li_run_…_1773906403515 | Droneguru | partner | si | Spanish drone service company | Claude Code |

## Session 3 — 2026-03-19 (Partner reclassification — 27 updates applied)

### Group 1: partner → si (8 updates, genuine DSPs/SIs)

| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|
| 2026-03-19 | …765716465 | Unifly | partner | si | UTM/airspace management platform, Terra Drone group | Claude Code |
| 2026-03-19 | …767963185 | Unifly | partner | si | Same entity, different article | Claude Code |
| 2026-03-19 | …765716465 | Aloft Technologies | partner | si | Drone airspace management SaaS | Claude Code |
| 2026-03-19 | …906739694 | Revector | partner | si | Counter-drone/detection tech | Claude Code |
| 2026-03-19 | …766516274 | Vumacam | buyer | si | AI surveillance network, commercial drone services | Claude Code |
| 2026-03-19 | …768055257 | Vumacam | partner | si | Same entity, different article | Claude Code |
| 2026-03-19 | …765760942 | Airbox | partner | si | Drone fleet management SaaS | Claude Code |
| 2026-03-19 | …765760942 | Versaterm | partner | si | Public safety software, drone integration | Claude Code |

### Group 2: partner → buyer (5 updates, end-users)

| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|
| 2026-03-19 | (score=80) | Daimler Truck | partner | buyer | End-user deploying UGV/UAV for logistics | Claude Code |
| 2026-03-19 | (score=80) | Ford Motor Company of Southern Africa | partner | buyer | End-user client of 24/7 Drone Force | Claude Code |
| 2026-03-19 | (score=65) | Saudi Sicli Fire and Rescue | partner | buyer | Fire/rescue end-user at NEOM | Claude Code |
| 2026-03-19 | (score=75) | National League of Cities | partner | buyer | Government association — end-user | Claude Code |
| 2026-03-19 | (score=60) | Northern Collin/Denton County Task Force | partner | buyer | Law enforcement task force — end-user | Claude Code |

### Group 3: partner → other (14 updates, non-drone entities)

| Date | Article ID | Entity Name | Old Type | New Type | Reason | Changed By |
|------|-----------|-------------|----------|----------|--------|------------|
| 2026-03-19 | (3 articles, score=90) | MITS Capital | partner | other | Investment/holding company, not drone services | Claude Code |
| 2026-03-19 | (3 articles, score=90) | Tencore | partner | other | Defense electronics subsidiary, not drone services | Claude Code |
| 2026-03-19 | (3 articles, score=90) | Infozahyst | partner | other | EW/signals intelligence, not commercial drone services | Claude Code |
| 2026-03-19 | (3 articles, score=90) | Unwave | partner | other | RF tech company, not drone services | Claude Code |
| 2026-03-19 | (score=85) | Qisda Corp | partner | other | Electronics manufacturer/investor, not DSP | Claude Code |
| 2026-03-19 | (score=75) | Wonder | partner | other | Food delivery company, not drone operator | Claude Code |

## Session 4 — 2026-03-19 (Ravi's manual LinkedIn post corrections — 4 fixes)

| Date | Article ID | Entity Name | Old | New | Reason | Changed By |
|------|-----------|-------------|-----|-----|--------|------------|
| 2026-03-19 | (activity:7340372190938238977) | DBOX | company="Implied DBOX Solution Provider" | company="DBOX", added si:DBOX | Lithuanian DIAB provider, LLM couldn't resolve name | Claude Code |
| 2026-03-19 | (activity:7434873603457916928) | Integrated Aerial Systems | company=null | company="Integrated Aerial Systems", added si | SA-based DSP, score=90, LLM missed from post text | Claude Code |
| 2026-03-19 | (activity:7424114664902508546) | kioniq | company="Planai-Hochwurzen-Bahnen" | company="kioniq", added si:kioniq | SI deploying for ski resort, buyer was in company field | Claude Code |
| 2026-03-19 | (activity:7440023586699931648) | ABTECH | company=null | company="ABTECH", added si:ABTECH | US-based DSP, post too short for LLM to extract | Claude Code |
