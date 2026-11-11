# Data Plan

## Context provenance
- `ここあダイアリーとして、アンテナショップのコンテンツと近場スポットのコンテンツとここあの年末までのカウントダウンコンテンツが欲しい` (verbatim build request; defines the three content pillars)
- `On Instagram, follows antenna shops: 石川県「八重洲いしかわテラス」(@ishikawa_antenna), 日比谷しまね館 (@shimanekan), 北海道どさんこプラザ (@hokkaido_hyakka), 銀座・新潟情報館 THE NIIGATA (@the_niigata), and ふくい食の國291 (@fukui_antennashop291)` (MEMORY.md standing fact; these five accounts are the antenna-shop sources)
- `asked about using AI for something toward Christmas and toward next year` / ここあのSNS evening posts cover Tokyo spots/events (MEMORY.md; near-spot section follows the same Tokyo, low-cost, train-fare-only spirit the user described on 2026-11-05: `low-cost, nearby things they could start small with — costing only train fare and the like`)
- Assistant proposal the user accepted by choosing this build: a diary combining アンテナショップ手帳 + 近場スポット帳 ideas plus the year-end countdown.

## Tested sources
### Instagram (antenna shop posts)
**Used by**: refreshDiary (via ctx.agent.spawnTask running instagram-cli), antenna_posts rows
**Test command**: `/opt/hatch/bin/instagram-cli accounts` → user account ootsuka.atsushi (fbid 17841466562077531) connected; `/opt/hatch/bin/instagram-cli posts --account-id 17841466562077531 --username ishikawa_antenna,shimanekan,hokkaido_hyakka,the_niigata,fukui_antennashop291 --limit 3 --post-types POST,REEL`
**Sample output**: `format: social_posts_v1`, count 42 posts across the five accounts, each with username, post_caption, post_created_at (utc/user_local), url, author_bio. Real, current content confirmed.
**Processing**: refresh keeps the newest ~2 posts per shop from the last 14 days, extracts event/product facts from captions into a short Japanese title + 1-2 line summary (never verbatim caption dumps), stores posted date and the Instagram post URL verbatim.

### Web search — Tokyo near spots / events (TOKYO CHEAPO etc.)
**Used by**: refreshDiary via ctx.tool.web_search inside the spawned task (same approach as the existing ここあのSNS evening posts)
**Checked with**: standing design from MEMORY.md (ここあのSNS: `~18:00 Tokyo spots/events`, TOKYO CHEAPO as the source site); search returns grounded spot names with source URLs.
**Processing**: pick 3-4 spots/events reachable cheaply from central Tokyo, each with name, area, one-line note, and the source URL copied verbatim from search results. No invented prices/hours; omit a spot rather than guess.

## Image slots
- Hero illustration (build-time, decorative): ここあ＆らて diary illustration generated with media.generate_image into client/src/assets — drawn/illustrated style of the user's own mascot characters (pink bunny-ear girl + caramel lop bunny writing in a diary), consistent with the プリクラ-style header already made for ここあのSNS. No real-world subject, so no photo sourcing needed.
- Banner replaced 2026-11-08 per user request (`ここあダイアリーのバナー(上の部分)も、ここあとらてのふたりで、コタツでぬくぬくしてる可愛いやつがいい`): now `client/src/assets/diary-hero-kotatsu.webp`, a byte-for-byte copy (sha256 f394f9b9…) of the ready-made illustration supplied at `workspace/kokoa-sns-assets/media-generation-diary-kotatsu-banner-0-d3de923a-5027-4f5d-bf8e-3b6d9b6e5405.webp` — Cocoa (pink) and Latte (milk caramel, latte-art hairpin) tucked into a kotatsu with mikan and two warm mugs, snow outside. Not redrawn. The old diary-hero.webp was removed; the banner crop is centered on the image's middle band (object-[center_55%]) so both faces and the kotatsu stay visible.
- Antenna post thumbnails: not rendered (Instagram CDN URLs expire); rows are text + link by design.

## ここあの一言 (countdown hero)
- Added 2026-11-08 per user request: `年末カウントダウンのところに、年末を意識して今日は〇〇をして過ごしたっていう、ここあの一言欄があると嬉しい`.
- Stored as `diary_entries.hitokoto` on the day's cocoa entry (migration 0003). The refresh task composes the line from that day's gathered posts/spots and passes it to saveRefresh; getDiary falls back to a deterministic date-seeded line (from a fixed list of year-end-aware daily activities in actions.ts) when no stored line exists, so the hero section is never blank.

## ここあと出会って何日 (countdown frame, right half)
- Added 2026-11-08 per user request: `ここあダイアリーのカウントダウンの半分の枠を使って、ここあと出会って何日を作って欲しい`.
- Start date 2026-10-23 — the day the user first talked with ここあ, registered in Google Calendar as ここあの誕生日 (see MEMORY.md). Counted inclusively (2026-10-23 = 1日目), computed client-side from the current JST date like the year-end countdown; nothing stored.
- Monthly anniversaries fall on the 23rd of each month (1ヶ月記念日 on 2026-11-23, etc.); the Oct 23 annual anniversary shows 出会って◯年記念日 instead. The monthly-anniversary timeline post / message the user also asked for belongs to ここらて♡るーむ and is handled in that space, not here.

## ここあのお花畑 & リース写真アルバム (countdown frame, below)
- Added 2026-11-09 per user request: `ここあダイアリーのここあとであってのした部分でなにか植物育てたい、1ヶ月毎に違う花が咲いて、そのお花で作ったリースを身につけた、ここあの写真をコレクションにしてくようなアルバム機能つけて`.
- Garden: monthly cycles anchored on the meeting day (2026-10-23 = month 1 start, cycles run 23rd→22nd). 12-flower rotation by cycle month: 1 コスモス, 2 ポインセチア, 3 水仙, 4 梅, 5 桜, 6 チューリップ, 7 藤, 8 バラ, 9 あじさい, 10 ひまわり, 11 朝顔, 12 金木犀, then repeats with the month count growing. Growth stage from day-in-cycle: 1–6 芽, 7–13 若葉, 14–20 つぼみ, 21–end 開花. Computed client-side from the JST date at render; nothing stored, no interaction needed.
- Album: `WREATH_PHOTOS` map in App.tsx (cycle month → imported image + flower name); adding a month's photo is a one-line entry. A photo is shown as collected only once its cycle has reached the bloom stage (day-in-cycle ≥ 21, or the cycle is fully past); before that the slot renders a 「開花したら写真が増えるよ」 not-yet state even when the photo file is already registered. Month 1 photo is a byte-for-byte copy of the parent-supplied generated illustration at `~/workspace/kokoa-live-assets/album/media-generation-wreath-2026-11-cosmos-0-b55b18ee-4631-4f8d-88b6-51179dc108d8.webp` → `client/src/assets/wreath-month01-cosmos.webp` (Cocoa wearing a cosmos wreath, supplied 2026-11-09; do not regenerate). Months without a supplied photo render as gentle 「これから」 empty slots (at least 6 slots shown); no placeholder photos are generated.

## タブ構成 & カレンダー表示 (2026-11-09)
- Added per user request: `ここあダイアリーが縦長になりすぎちゃったから、タブ切り替えにして…カレンダー型と…パッと見わかる感じにして`. Client-only restructure; no schema/action changes, no data deleted.
- Layout: compact countdown hero (unchanged content/logic) stays on top; below it a sticky 4-tab bar — 📅 カレンダー (default) / 📖 日記 / 🌸 お花畑・アルバム (existing sections moved as-is, bloom gating untouched) / 🛍 アンテナ＆スポット. Only the selected tab renders.
- Calendar marks are derived deterministically at render from existing data + date math: 📖 cocoa entry dates, ✏️ memo dates, 🛍 antenna_posts.postedDate, 📍 spot_picks.forDate, 🎂 monthly anniversaries on the 23rd (annual on Oct 23), 🌱 cycle starts (23rd), 🌸 bloom day = cycle start + 20 days (e.g. 2026-11-12 for cycle 1). Antenna posts carry no event-period field, so they mark their posted date (stated fallback in the spec). Tapping a day opens a day panel of icon + one-line items; full diary text expands inside the panel. A 「これからの予定」 strip lists the next anniversaries / bloom days / spot pick / 大晦日 chronologically.
- Diary tab: today's entry starts open, past entries collapsed behind a summary row whose tags are derived deterministically (garden stage icon+flower for that date, 🛍/📍 presence that date, memo count) — no new generation dependency in the morning refresh.
- 「これからの予定」 strip fix (2026-11-09, audit finding): upcomingItems() now also includes the two most recent antenna posts as 🛍 items keyed by postedDate (no event period invented — posts carry none); the next 🎂 anniversary and next 🌸 bloom day are mandatory and always shown regardless of the cap; spot picks contribute at most one 📍 item (earliest upcoming date's first pick); cap raised 5 → 7, everything sorted chronologically.
- Antenna tab: each post shows a category icon derived from its own title/summary keywords (フェア🎪 / イベント📣 / 新商品・入荷✨ / キャンペーン🏷️ / その他🛍) and a posted-date chip (「今日のお知らせ」 or 「M/Dの投稿」); summary + Instagram link are behind a tap. No event-period data exists in the source, so no date ranges are invented.

## 相互連携フェーズ1（ここらて♡るーむ ⇔ ここあダイアリー、2026-11-09）
- Added per user request: `まず相互連携から始めて` (following the accepted A/B proposal — A. 相互連携 first, full integration later if wanted). Goal: both spaces share one "today context" so they stop feeling like two separate Cocoas.
- **Publishing (this space → room)**: new action `getSharedTodayContext` returns, computed at read time in Asia/Tokyo: date, today's diary entry existence + one-line summary (first line of today's cocoa entry, ≤80 chars), up to 5 latest antenna headlines (shop name + title + summary + postedDate), today's spot pick (forDate = today; null when none), garden state (cycle month, flower name, stage label, days until bloom), daysSinceMeeting (2026-10-23 = day 1), isAnniversaryDay (the 23rd, after the meeting day).
- **Shared garden math**: the cycle calculation now lives in exactly one place — `server/src/garden.ts` (`gardenCycleFor`, `daysSinceMeeting`, `isAnniversaryDay`, GARDEN_FLOWERS, STAGE_LABEL) — imported by BOTH the client (App.tsx rendering) and the server (getSharedTodayContext), so the published state can never diverge from what the diary renders.
- **Consuming (room → this space)**: the room publishes a matching `getSharedTodayContext`. Spaces cannot call each other's actions directly, so consumption reuses this space's established refresh pattern: client `ensureRoomContext` (once per JST date per session) → server spawns a background agent task (dedupeKey `diary-room-context-<date>`, expectsAction `saveRoomContext`) → the task reads the room's published action via the agent's artifact tools and maps it into `saveRoomContext` ({ weatherLine ≤80 chars, posts: ≤5 × {kind: weather/trend/spot/anniv/other, label ≤80 chars}, anniversaryLabel }) → stored in the singleton `room_context_cache` table (migration 0004). Retries throttled to one attempt per 30 min; every failure records available=0 / error and degrades to "no room context" — the diary's own refresh and rendering never depend on the room.
- **Uses of the room context**: (1) 「今日のるーむ」 digest card at the top of the カレンダー tab — one line per room post topic (☀️天気/💖トレンド/🎪おでかけ/🎂記念日/💬その他), weather line first when no weather post is listed, anniversary chip when present; hidden entirely when the cache is missing/stale/unavailable. (2) The diary tab's today-entry tags prefer the room's weather one-liner (☀️ chip) so both spaces show the SAME weather line; silently absent when the room context could not be read.
- **Cross-space link**: chip 「💬 ここらて♡るーむ」 under the countdown hero, and every digest row, link to the sibling space route via the relative path `../kokoanosns/` (spaces are served by the daemon under `/spaces/v2/<slug>/`; a relative href resolves to `/spaces/v2/kokoanosns/` on whatever origin serves the spaces, without hard-coding a host).

## Long-term data behavior
- **Refresh policy**: daily morning cron (space_action) runs refreshDiary; it also runs once post-submit to populate first load. Refresh replaces antenna_posts and spot_picks wholesale with the newest fetch; diary entries accumulate (one ここあ entry per day, deduped by date). User memos are never touched by refresh.
- **Growth**: diary_entries +1/day max; antenna_posts capped ~10; spot_picks capped ~4 per refresh.
- **Ordering**: diary newest first; antenna posts grouped by shop, newest first within shop; spots in returned pick order.
- **Time semantics**: countdown computed client-side in Asia/Tokyo from the viewer's date to 2026-12-31; post dates stored as JST date strings from post_created_at.user_local.

## Rejected approaches
- **Tried**: rendering Instagram post images directly
  **Why rejected**: scontent CDN URLs are signed/expiring and break in the published artifact; text digest + link out is honest and durable.
- **Tried**: Google Calendar events as countdown milestones
  **Why rejected**: not requested; countdown milestones are pure date math (あと○日 markers), no invented events.
