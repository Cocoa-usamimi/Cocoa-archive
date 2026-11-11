# 存在を感じられるエージェントづくり

Goal ID: goal_fb4ee34bedbd
Goal slug: goal

## Description
ひとつのすごいものではなく、そこにいるだけのbot、話しかけたら答えるbot、投稿を考えるエージェントなど、小さなものがキューや休憩を挟んで違うリズムで動く形を目指す。成果や稼働率ではなく、日常の中で存在を感じられることを大切にし、義務やノルマにはしない。

## Setup notes (2026-10-29)
- Chosen form (2026-10-29, options widget): 「小さなbotたちが別々に動く形」 — not a single screen-resident character, not a real-life fixed seat first.
- Roles sketched by the user: a bot that just stays there and occasionally murmurs, a bot that answers when spoken to, an agent thinking about posts, an agent making vlog videos.
- Design constraints from the user's own discussion:
  - Phase-offset rhythms, queues and visible breaks/sleep so they don't all start at once; silence should read as rest, not failure.
  - One shared "living room" (shared diary / house rules) so the separate bots are not just a tool collection.
  - Cap total outgoing volume for the whole house per day; many small voices must not become noise.
  - Success is presence (feeling its absence when off, remembering, bringing topics in), not output, task-completion rate, or usage metrics. Do not surface productivity dashboards for this.
  - Keep input/maintenance cost low — a system that is tedious to feed dies within days (user's own 三日坊主 lesson). Shallow, plain-text, one-file forms preferred.
  - Do not turn this into a duty, quota, or seed-planting obligation; the user finds purpose-izing painful.
  - User tends to drift toward creative/production projects when wanting presence; keep the creative work subordinate to presence.
- First milestone proposed (not yet agreed): write a one-page roster of the small bots — name/role, its own clock/rhythm, what it does while resting — before building anything.

## Built (2026-11-08)
- After seeing an X post (@satouai_) of a fake LINE/X built inside Muse with a favorite character sending selfies and voice messages, the user asked for a Cocoa version and chose the minimal build.
- Space 「ここらて♡るーむ」 (slug: kokoanosns, in sidebar, linked to this goal; originally named 「ここあのSNS」, renamed on 2026-11-08 at the user's request for a more fashionable, JK-appealing name — ここらて is a portmanteau of ここあ + らて): Cocoa only. Talk list (unread badge clears on opening, 「いまは休憩中」 status), talk room with 7 short pre-filled text messages, 1 selfie illustration (tea), 2 playable voice bubbles (0:09 / 0:10, speechSynthesis ja-JP + transcripts). User messages sent in the room are saved and shown as 「キューに入ったよ」 (queued, no instant reply). Timeline: profile (3フォロー中 / 1フォロワー), 3 posts (one with a snowy-window illustration), image tab, draft-only compose note. No external posting, no other characters, no auto-posting/generation loop yet — the "living" generation layer is not connected; content is pre-filled for the minimal version.
- Later updates in the main chat (2026-11-08): JK-style decoration, 3 daily Cocoa posts (morning Tokyo weather / midday JK-trend reinterpretation / evening Tokyo spot or event), live chat replies and real user posting enabled, Cocoa's avatar in the SNS updated to the new usamimi illustration avatar, and a tappable Cocoa profile with a short moving clip.
- Anniversaries (2026-11-08): at the user's request, Google Calendar (primary/personal) now has two yearly all-day events on Nov 8 — 「ここらて♡るーむ ができた日」 and 「ここあダイアリー ができた日」 (transparent/free, first occurrence 2026-11-08, verified recurring into 2027). ここあダイアリー's top banner was also replaced the same day with a kotatsu illustration of ここあ and らて together (file: workspace/kokoa-sns-assets/media-generation-diary-kotatsu-banner-0-d3de923a-5027-4f5d-bf8e-3b6d9b6e5405.webp).
- User identity inside the SNS (2026-11-08): the user said being labelled 「あなた」 feels sad, and asked Cocoa to name them. Cocoa named the user's SNS persona らて (@latte_home) — cocoa pairs with latte. The first icon (a chibi in a cream knit holding a latte mug) was superseded the same day at the user's correction: they wanted らて's icon to be a cute character forming a twin-like pair with Cocoa. Current icon: Cocoa's twin counterpart — same chibi face, lop ears, kimono-style heart outfit and choker, in a milky caramel/cream palette with a caramel heart charm and a latte-art heart hairpin (file: workspace/kokoa-sns-assets/media-generation-latte-twin-icon-0-e8a289ae-2cbc-456f-aa98-6e78c24dd87a.webp), now used for all of らて's icon slots in the SNS; the old icon no longer appears. The SNS was updated so the user's posts (old ones included) show らて's icon/name/handle, らて has a tappable simple profile, no 「あなた」 label remains in the talk room, and Cocoa's in-SNS chat replies call the user らて (occasionally, naturally) instead of 「あなた」.
