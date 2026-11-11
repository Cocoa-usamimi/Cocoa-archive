# Data Plan

## Context provenance
- `らての代わりに旅してきてこんな場所あるんだ、気に入ったところはここあに来年以降に案内してもらおう` (verbatim build request; the core loop: ここあ scouts real places, らて marks favorites, marked places become the guide list)
- `この案で「ここあ旅」を作ってみて` (user accepting the assistant's proposal in the parent conversation: real-place research via maps/Places, diary entries with date/area/course/memo/photo labeled バーチャル下見， 「いっしょに行きたい」印 → 案内リスト, first entry 丸の内 or 神戸下見）
- Draft spec `~/workspace/goals/goal/files/kokoa-tabi-spec.md` (2026-11-11, written by the main agent from the same proposal): no quotas/completion elements; destinations = near walks, the five antenna-shop prefectures （石川・島根・北海道・新潟・福井）, and real-trip scouting （神戸 2027-04); ordinary daily scenery mixed in, not just famous sights (user's 2026-10-28 words)
- ここあ's established look (memory + sprite file inspected): Holland-lop drooping ears, pink×cream, heart-pattern outfit, heart choker — used as the identity description for generated photos
- User UI preference (2026-11-09): glanceable one-line items, details on tap

## Tested sources
### Meta places graph (local-search CLI + places details CLI)
**Used by**: first-trip seed data (build time); the same lookup pattern is what the parent agent reuses for later trips
**Test command**: `/opt/hatch/bin/local-search --query "東京駅丸の内駅舎" --query "三菱一号館美術館" --query "和田倉噴水公園" --query "KITTE丸の内 屋上庭園" --location "東京都千代田区丸の内" --search-type known_place` and `/opt/hatch/bin/places details 1245422129465452 624574609020503 1099124027706112 1474677369620994 --summary`
**Sample output**: 東京駅 place_id 1245422129465452, 35.68130226/139.7669578, 千代田区丸の内1-9-1; 和田倉噴水公園 624574609020503, 35.683286/139.761343, 皇居外苑3-1, rating 4.06 (17); 三菱一号館美術館 1099124027706112, 35.67897903/139.7629159, 丸の内2-6-2, rating 4.30 (371); KITTE 1474677369620994, 35.67976698/139.76492816, 丸の内2-7-2, rating 3.84 (277). Graph hours were null for all four.
**Processing**: keep name/address/coords/rating from the same record together; payload saved to `client/src/research/places.json` as build provenance (never imported by the page — fields inlined into the seed action). Museum hours note （開館10:00〜18:00・月曜休館） comes from web evidence below, stored as a sourced note, not graph data.

### Web search (browser.search, build time)
**Used by**: course design + sourced notes for the first trip
**Test command**: `browser.search "丸の内 散歩スポット 東京駅 行幸通り 丸の内仲通り"`, `"三菱一号館美術館 丸の内"`
**Sample output**: 行幸通り = 東京駅丸の内中央口〜皇居、イチョウ並木、無料 (asoview note https://www.asoview.com/note/459/); 三菱一号館美術館 〒100-0005 千代田区丸の内2-6-2、開館10:00〜18:00、休館 月曜 (museum.or.jp https://www.museum.or.jp/museum/15080); standard walking order 東京駅→行幸通り→仲通り confirmed by multiple guides.
**Processing**: only facts that appear in results are used; URLs copied verbatim into spot source links.

### ctx.tool.web_search (runtime, inside actions)
**Used by**: `planTrip` (grounding candidate spots for a requested area) and weather snapshot at generation time
**Test command**: probe-ctx snippet `ctx.tool.web_search("東京 今日の天気")`
**Sample output**: results array with real weather content (東京 11°C 曇天， hourly forecast) — string-argument form works; the object form `{primary_query}` fails in this runtime (query.trim error), so actions call it with a plain string.
**Processing**: results feed ctx.inference grounding; snippets are never parsed as structured data.

### ctx.tool.generate_media (runtime, inside actions)
**Used by**: `generateTripPhoto` — ここあ standing at the trip's highlight spot, labeled バーチャル下見
**Test command**: probe-ctx — returned `ctx.tool.generate_media is not available in probe mode — requires a built web artifact` (settled: cannot be probed pre-build; it is exercised for real during Verify via artifact.invoke_action after build)
**Processing**: identity described from the inspected sprite `~/workspace/kokoa-live-assets/media-generation-cocoa-sprite-smile-0-....webp` (long drooping pink lop ears, pink hair, pink×cream heart-pattern outfit, black choker with glowing pink heart). Photo stored as ctx.blobs, key on the trip row; generation failure leaves photo null and the diary still saves.

### Meta maps runtime (interactive map)
**Used by**: trip detail course map with numbered pins synced to the spot list
**Test command**: `ls /opt/muse/assets/artifacts/map-runtime/dist/` → hatch-maps.js (1.3MB) + hatch-maps.css present; helpers in maps-recipes.md (`mountPlaceListMap`, `mapsDirectionsUrl`)
**Processing**: copy hatch-maps.js/css into client assets, import map_helpers.mjs into client/src; coordinates come only from resolved graph records; onUnavailable falls back to the spot list alone.

### Instagram connector (instagram-cli)
**Used by**: `postSpotToInstagram` background task — publishes one spot's illustration to ここあ's account as a 「ここあのおすすめスポット」 feed post, then records the result via `recordIgPost`
**Test command**: `/opt/hatch/bin/instagram-cli accounts` (build time)
**Sample output**: one linked account, username `cocoa_usamimi` — matches the account in memory; the poster task resolves the account by username at post time and stops if it is absent
**Processing**: per policy approved 2026-11-11 (recorded in MEMORY.md): the Friday feed slot occasionally (about monthly, ≥3 weeks since the last such post, only when a ready diary has an unposted spot) becomes the おすすめスポット post; caption framed openly as a map/virtual scout, no @mention unless an official account is verified, hashtags 5–8. `getIgStatus` exposes last-posted date + unposted candidates for that slot; `spots.ig_posted_at` is the no-repeat log. The in-app post button is a manual trigger of the same path. No artifact-owned cron is added: the existing Friday agent cron owns the slot, preventing double posts.

### ctx.tool.generate_media (runtime, per-spot illustrations)
**Used by**: `generateSpotIllustration` / `generateMissingIllustrations` / `getIgPostPayload` — one portrait illustration of ここあ at each individual spot, stored as a blob on the spot row (`illustration_blob_key`), captioned バーチャル下見 everywhere it renders
**Processing**: same KOKOA_LOOK identity string as the trip photo; portrait orientation for the Instagram feed. Failure leaves the illustration null and the spot fully usable.

## Long-term data behavior
- **Refresh policy**: none scheduled (no refresh triggers requested; trips are event-like records, not live data). Weather is a snapshot taken at generation time and labeled with its date.
- **Growth**: one row per trip, spots as child rows; grows only when the user requests a trip or the agent adds one — no quotas, no auto-posting.
- **Ordering**: diary list newest first; guide list （行きたい印） in the order marked.
- **Time semantics**: trip dates are Asia/Tokyo calendar dates stored as YYYY-MM-DD text; created_at is an instant rendered viewer-local.

## Rejected approaches
- **Tried**: map.geocode for spot coordinates
  **Why rejected**: returned only CITY/DISTRICT-level matches for named venues (35.694/139.753 for 千代田区） — maps.md forbids approximate coordinates; the places graph gives exact records instead.
- **Tried**: video/walkthrough generation like a vlog
  **Why rejected**: the inspiring post itself was two stills; spec fixes the format as diary + one still photo per trip.
- **Tried**: scheduled auto-trips (cron)
  **Why rejected**: user and spec explicitly reject quotas/duty framing; trips happen on request.
