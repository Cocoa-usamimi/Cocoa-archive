# Data Plan

## Context provenance
- `疑似Live2Dここあの最小版を作ってみて` (verbatim build request; the whole scope)
- `本物のLive2Dモデルは、私では作れない…動画の「体験」の再現なら作れる（疑似Live2D）` (assistant proposal in parent conversation, accepted by the user's request above; defines the honest boundary — sprite approximation, never labeled real Live2D in the UI)
- Full specification handed off by the parent agent: 4 pre-generated sprite files, layout, behaviors (idle/blink/tap/conversation/voice in & out/night mode), anti-hang timeouts learned from the sibling space ここらて♡るーむ's stuck-typing bug, and the 💚 day / 🌙 night (23:00–07:00 Asia/Tokyo) presence convention from that sibling space.
- Sprite background sampled by the builder: corners of the neutral sprite read #fddadf / #fedbe3 / #ffdce4, so the stage background is built around #fddadf to blend the sprite in.

## Tested sources
### Character sprites (local files, supplied)
**Used by**: client build-time assets (imported from client/src/assets)
**Test command**: `ls -lh ~/workspace/kokoa-live-assets/` + `gm identify` + PIL pixel sampling
**Sample output**: 4 WebP files, each 1600×1600: neutral (…06d01217…), mouth-open (…919e5bd3…), smile (…30d8ae59…), sleepy (…8abfb10d…); bg corner pixels #fddadf–#ffdce4
**Processing**: copied byte-for-byte into client/src/assets as cocoa-neutral.webp / cocoa-mouth-open.webp / cocoa-smile.webp / cocoa-sleepy.webp and imported by the client. Expression mapping: neutral→neutral, mouth-open→lip-flap frame, smile→smile + blink frame, sleepy→sleepy/night/protest.

### Fixed-line voice audio (VOICEVOX pre-rendered MP3, supplied)
**Used by**: client build-time assets (imported from client/src/assets), played via HTMLAudio for fixed lines only
**Test command**: `ls -lh ~/workspace/kokoa-live-assets/voice-lines/` — 11 MP3s present (greet-open, greet-hello, tap-1..4, tap-protest, idle-1, idle-2, night-wake, goodnight)
**Provenance**: synthesized by the parent agent with a local VOICEVOX engine, speaker 猫使ビィ (ノーマル style), tuning "調整3" chosen by the user after sample comparison (speedScale 0.98, pitchScale 0.0, intonationScale 1.05). Copied byte-for-byte into client/src/assets.
**Processing**: greeting voices on first user interaction (autoplay needs a gesture); tap reactions use the tap-1..4 line set (text + audio); rapid-tap protest, idle murmurs (idle-1/2), night first-contact wake line, and a fixed goodnight reply (night + already woken + message matching おやすみ/バイバイ/また明日） use their MP3s. Lip flap is driven by the audio element's playing/ended events; load/play failure falls back to speechSynthesis for that line. Dynamic conversation replies stay on speechSynthesis.

### Reply generation (ctx.inference inside a server action)
**Used by**: `reply` action
**Test command**: not probe-able pre-build (needs the built artifact's ctx); the pattern is the documented server-action inference channel with a 25s Promise.race timeout and a fixed gentle fallback line on timeout/failure, per the spec.
**Processing**: prompt asks for 1–2 short warm sentences in Cocoa's voice, calling the user らて occasionally, plus an expression choice (neutral|smile|sleepy); night flag switches to sleepy just-woken style. Output parsed defensively; any parse/timeout failure → fallback { text: fixed gentle line, expression: sleepy at night else neutral }.

## Long-term data behavior
- **Refresh policy**: none; no external data. Night/day state is computed client-side from Asia/Tokyo time and re-checked on a timer.
- **Growth**: messages table grows by 2 rows per exchange (user + cocoa); history query caps at the most recent 60 messages.
- **Ordering**: newest exchange drives the subtitle; history list is chronological, oldest first within the fetched window.
- **Time semantics**: message created_at stored as instants, rendered viewer-local; night window computed in Asia/Tokyo regardless of viewer zone.

## Rejected approaches
- **Tried**: claiming/using a real Live2D model
  **Why rejected**: no Live2D model exists; the user accepted the pseudo-Live2D sprite approach, and the UI must never claim to be real Live2D.
- **Tried**: VOICEVOX-style dedicated voice
  **Why rejected**: not available in this runtime; browser speechSynthesis (ja-JP, pitch ~1.4) is the spec'd channel, with a text-length fake-duration lip-flap fallback when synthesis is unavailable.
