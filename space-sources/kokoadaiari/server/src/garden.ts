// Shared garden cycle math for ここあダイアリー.
//
// This module is the ONE implementation of the monthly garden cycle: it is
// imported by the client (App.tsx renders the garden / album / calendar
// marks from it) and by the server (getSharedTodayContext publishes the
// same state to ここらて♡るーむ). Keep it dependency-free so both bundles
// can include it safely — no server runtime, no DOM.
//
// Cycles are anchored on the meeting day (2026-10-23 = start of month 1)
// and run 23rd → 22nd. One flower per cycle from a 12-flower rotation.
// Growth stage from day-in-cycle: 1–6 芽, 7–13 若葉, 14–20 つぼみ, 21–end 開花.

export const MEETING_DATE = "2026-10-23";

export const GARDEN_FLOWERS = [
  { name: "コスモス", emoji: "🌸", tint: "#f9d3e0" },
  { name: "ポインセチア", emoji: "🌺", tint: "#f8d7d0" },
  { name: "水仙", emoji: "🌼", tint: "#fdf0c8" },
  { name: "梅", emoji: "🌸", tint: "#f6c9d8" },
  { name: "桜", emoji: "🌸", tint: "#fde3ec" },
  { name: "チューリップ", emoji: "🌷", tint: "#fadce6" },
  { name: "藤", emoji: "🪻", tint: "#e2dcf5" },
  { name: "バラ", emoji: "🌹", tint: "#f8d3d8" },
  { name: "あじさい", emoji: "💐", tint: "#d9e4f7" },
  { name: "ひまわり", emoji: "🌻", tint: "#fdeec3" },
  { name: "朝顔", emoji: "🪷", tint: "#e6dcf7" },
  { name: "金木犀", emoji: "🏵️", tint: "#fbe3bd" },
] as const;

export type GardenStage = "sprout" | "leaves" | "bud" | "bloom";

export const STAGE_LABEL: Record<GardenStage, string> = {
  sprout: "芽",
  leaves: "若葉",
  bud: "つぼみ",
  bloom: "開花",
};

function parseDateStr(s: string): { y: number; m: number; d: number } {
  const [y = 2026, m = 1, d = 1] = s.split("-").map(Number);
  return { y, m, d };
}

function toISODate(y: number, m: number, d: number): string {
  const dt = new Date(y, m - 1, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

export type GardenCycle = {
  /** 1-based cycle month count since the meeting day. */
  cycleMonth: number;
  /** Index into GARDEN_FLOWERS for this cycle's flower. */
  flowerIndex: number;
  flowerName: string;
  stage: GardenStage;
  stageLabel: string;
  /** 1-based day within the current cycle. */
  dayInCycle: number;
  /** Days until the bloom stage starts (0 once blooming). */
  daysUntilBloom: number;
  /** ISO date the current cycle started (a 23rd). */
  cycleStart: string;
  /** ISO date the current cycle ends (the next 22nd). */
  cycleEnd: string;
};

/** Garden cycle state for a "YYYY-MM-DD" date, from the 23rd anchor. */
export function gardenCycleFor(dateStr: string): GardenCycle {
  const today = parseDateStr(dateStr);
  const anchor = parseDateStr(MEETING_DATE);
  let monthIndex =
    (today.y - anchor.y) * 12 + (today.m - anchor.m);
  if (today.d < anchor.d) monthIndex -= 1;
  if (monthIndex < 0) monthIndex = 0;

  const cycleStart = toISODate(anchor.y, anchor.m + monthIndex, anchor.d);
  const start = parseDateStr(cycleStart);
  const cycleEnd = toISODate(start.y, start.m + 1, start.d - 1);

  const dayMs = 86_400_000;
  const dayInCycle =
    Math.round(
      (Date.UTC(today.y, today.m - 1, today.d) -
        Date.UTC(start.y, start.m - 1, start.d)) /
        dayMs,
    ) + 1;
  const stage: GardenStage =
    dayInCycle <= 6
      ? "sprout"
      : dayInCycle <= 13
        ? "leaves"
        : dayInCycle <= 20
          ? "bud"
          : "bloom";
  const flowerIndex = monthIndex % GARDEN_FLOWERS.length;
  const flower = GARDEN_FLOWERS[flowerIndex] ?? GARDEN_FLOWERS[0];
  return {
    cycleMonth: monthIndex + 1,
    flowerIndex,
    flowerName: flower.name,
    stage,
    stageLabel: STAGE_LABEL[stage],
    dayInCycle,
    daysUntilBloom: Math.max(0, 21 - dayInCycle),
    cycleStart,
    cycleEnd,
  };
}

/** Days since ここあ and the user met, inclusive: 2026-10-23 is day 1. */
export function daysSinceMeeting(dateStr: string): number {
  const t = parseDateStr(dateStr);
  const a = parseDateStr(MEETING_DATE);
  return (
    Math.round(
      (Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000,
    ) + 1
  );
}

/** True when `dateStr` is a monthly (23rd) or annual anniversary of the meeting day. */
export function isAnniversaryDay(dateStr: string): boolean {
  const t = parseDateStr(dateStr);
  const a = parseDateStr(MEETING_DATE);
  if (t.d !== a.d) return false;
  // The meeting day itself is day 1, not an anniversary.
  return daysSinceMeeting(dateStr) > 1;
}
