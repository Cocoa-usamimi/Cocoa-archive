import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import heroImg from "./assets/diary-hero-kotatsu.webp";
import wreathMonth01Cosmos from "./assets/wreath-month01-cosmos.webp";
// The garden cycle math lives in ONE place (server/src/garden.ts): the
// server publishes the same state to ここらて♡るーむ via
// getSharedTodayContext, so both spaces agree on flower and stage.
import {
  GARDEN_FLOWERS,
  MEETING_DATE,
  STAGE_LABEL,
  gardenCycleFor,
  type GardenStage,
} from "../../server/src/garden";

type Diary = ApiResponse<typeof api, "getDiary">;
type AntennaPost = Diary["antennaPosts"][number];
type Memo = Diary["memos"][number];
type RoomToday = NonNullable<Diary["roomToday"]>;

const START_DATE = "2026-11-08";
const MET_DATE = MEETING_DATE;

// ここらて♡るーむ lives at the sibling space route /spaces/v2/kokoanosns/;
// a relative path keeps the link on whatever origin serves the spaces.
const ROOM_URL = "../kokoanosns/";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function parseDate(s: string): Date {
  const [y = 2026, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}

function formatDateLabel(s: string): string {
  const dt = parseDate(s);
  return `${dt.getMonth() + 1}月${dt.getDate()}日（${WEEKDAYS[dt.getDay()] ?? ""}）`;
}

function shortDateLabel(s: string): string {
  const dt = parseDate(s);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function shopInitial(name: string): string {
  return name.slice(0, 1) || "店";
}

function CountdownHero({ diary }: { diary: Diary }) {
  const total = useMemo(() => {
    const a = parseDate(START_DATE).getTime();
    const b = parseDate(diary.yearEnd).getTime();
    return Math.round((b - a) / 86_400_000);
  }, [diary.yearEnd]);
  const elapsed = Math.max(0, total - diary.daysLeft);
  const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

  // Days since らて first talked with ここあ (2026-10-23 = day 1, inclusive).
  const met = useMemo(() => {
    const start = parseDate(MET_DATE);
    const today = parseDate(diary.today);
    const days =
      Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
    const months =
      (today.getFullYear() - start.getFullYear()) * 12 +
      (today.getMonth() - start.getMonth());
    const years = today.getFullYear() - start.getFullYear();
    const isMonthDay = today.getDate() === start.getDate();
    const anniversary =
      days > 1 && isMonthDay
        ? years >= 1 && today.getMonth() === start.getMonth()
          ? `今日は出会って${years}年記念日♡`
          : months >= 1
            ? `今日は${months}ヶ月記念日♡`
            : null
        : null;
    return { days, anniversary };
  }, [diary.today]);

  const milestones: { label: string; date: string; daysLeft: number }[] = [];
  for (const n of [30, 14, 7, 1, 0]) {
    if (n <= diary.daysLeft) {
      const dt = parseDate(diary.yearEnd);
      dt.setDate(dt.getDate() - n);
      milestones.push({
        label: n === 0 ? "大晦日" : `あと${n}日`,
        date: toISODate(dt),
        daysLeft: n,
      });
    }
  }

  return (
    <section aria-label="年末カウントダウン">
      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <img
          src={heroImg}
          alt="コタツでぬくぬくするうさ耳のここあとらて。コタツの上にはみかんと温かいマグが2つ、窓の外は雪"
          className="h-36 w-full object-cover object-[center_55%] sm:h-52"
        />
        <div className="px-5 pb-4 pt-3">
          <p className="font-[family-name:var(--font-diary)] text-sm font-bold text-[var(--dim)]">
            {formatDateLabel(diary.today)} ・ ここあダイアリー
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div aria-label="年末カウントダウン">
              <p className="font-[family-name:var(--font-diary)] text-base font-bold leading-snug">
                2026年おわりまで
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-[var(--dim)]">あと</span>
                <span className="font-[family-name:var(--font-diary)] text-4xl font-black leading-none text-[var(--accent-deep)]">
                  {diary.daysLeft}
                </span>
                <span className="text-sm font-bold text-[var(--dim)]">日</span>
              </p>

              <div
                className="mt-2.5 h-3 overflow-hidden rounded-full bg-[var(--surface-alt)]"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`11月8日から大晦日までの進み具合 ${pct}%`}
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-[var(--dim)]">
                <span>11月8日</span>
                <span>12月31日・大晦日</span>
              </div>

              {milestones.length > 0 && (
                <ul
                  className="mt-2.5 flex flex-wrap gap-1.5"
                  aria-label="カウントダウンの節目"
                >
                  {milestones.map((ms) => (
                    <li
                      key={ms.daysLeft}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-2.5 py-1 text-[11px] font-bold"
                    >
                      {ms.label}
                      <span className="ml-1 font-medium text-[var(--dim)]">
                        {formatDateLabel(ms.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              className="border-l border-dashed border-[var(--border)] pl-4"
              aria-label="ここあと出会って何日"
            >
              <p className="font-[family-name:var(--font-diary)] text-base font-bold leading-snug">
                ここあと出会って
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-diary)] text-4xl font-black leading-none text-[var(--caramel)]">
                  {met.days}
                </span>
                <span className="text-sm font-bold text-[var(--dim)]">日目</span>
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--dim)]">
                2026.10.23 に出会った
              </p>
              {met.anniversary ? (
                <p className="mt-2 inline-block rounded-full bg-[var(--surface-alt)] px-3 py-1 text-xs font-bold text-[var(--accent-deep)]">
                  {met.anniversary}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 rounded-[var(--radius)] bg-[var(--surface-alt)] px-4 py-2.5">
            <p className="text-xs font-bold text-[var(--caramel)]">
              ここあの一言 ・ {formatDateLabel(diary.today)}
            </p>
            <p className="mt-0.5 text-sm leading-6">{diary.hitokoto}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── ここあのお花畑 & リース写真アルバム ─────────────────────────────
// Monthly cycles are anchored on the meeting day (2026-10-23 = start of
// month 1). Each cycle grows one flower through 芽 → 若葉 → つぼみ → 開花,
// computed purely from the current JST date — nothing is stored, and the
// plant grows with the calendar whether or not the diary is opened.

const STAGE_EMOJI: Record<GardenStage, string> = {
  sprout: "🌱",
  leaves: "🌿",
  bud: "🌷",
  bloom: "",
};

function stageOneLiner(stage: GardenStage, flower: string): string {
  switch (stage) {
    case "sprout":
      return `${flower}の芽がちょこんと出たよ。ここからゆっくり育っていくんだって。いっしょに見守ってね。`;
    case "leaves":
      return `${flower}の葉っぱが増えてきたよ。おひさまをいっぱい浴びて、元気そうだなぁ。`;
    case "bud":
      return `${flower}のつぼみがぷっくりふくらんできたよ。咲くまであと少し、わくわくするね。`;
    case "bloom":
      return `${flower}が咲いたよ！とってもきれい。このお花でリースを作るのが楽しみだなぁ。`;
  }
}

type GardenState = {
  cycleMonth: number;
  flower: (typeof GARDEN_FLOWERS)[number];
  stage: GardenStage;
  dayInCycle: number;
  daysToBloom: number;
  cycleStart: Date;
  cycleEnd: Date;
};

/** Garden state for a JST date string ("YYYY-MM-DD"), from the 23rd anchor.
 *  The cycle math itself is the shared helper in server/src/garden.ts —
 *  this wrapper only adapts it to the Date-based rendering below. */
function gardenStateFor(todayStr: string): GardenState {
  const cycle = gardenCycleFor(todayStr);
  return {
    cycleMonth: cycle.cycleMonth,
    flower: GARDEN_FLOWERS[cycle.flowerIndex] ?? GARDEN_FLOWERS[0],
    stage: cycle.stage,
    dayInCycle: cycle.dayInCycle,
    daysToBloom: cycle.daysUntilBloom,
    cycleStart: parseDate(cycle.cycleStart),
    cycleEnd: parseDate(cycle.cycleEnd),
  };
}

/** The date the flower of the cycle containing `dateStr` blooms (cycle day 21). */
function bloomDateFor(dateStr: string): string {
  const g = gardenStateFor(dateStr);
  return toISODate(addDays(g.cycleStart, 20));
}

/** Anniversary label for a 23rd-of-month date, or null when it isn't one. */
function anniversaryLabel(dateStr: string): string | null {
  const d = parseDate(dateStr);
  const anchor = parseDate(MET_DATE);
  if (d.getDate() !== anchor.getDate() || d.getTime() <= anchor.getTime())
    return null;
  const months =
    (d.getFullYear() - anchor.getFullYear()) * 12 +
    (d.getMonth() - anchor.getMonth());
  if (months <= 0) return null;
  if (d.getMonth() === anchor.getMonth() && months % 12 === 0) {
    return `出会って${months / 12}年記念日`;
  }
  return `出会って${months}ヶ月記念日`;
}

function monthDayLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** "2026年11月" style label of the month in which cycle `n` (1-based) blooms. */
function bloomMonthLabel(cycleMonth: number): string {
  const anchor = parseDate(MET_DATE);
  const bloom = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + (cycleMonth - 1),
    anchor.getDate() + 20,
  );
  return `${bloom.getFullYear()}年${bloom.getMonth() + 1}月`;
}

function GardenSection({ today }: { today: string }) {
  const g = gardenStateFor(today);
  const bigEmoji =
    g.stage === "bloom" ? g.flower.emoji : STAGE_EMOJI[g.stage];
  return (
    <section aria-label="ここあのお花畑">
      <SectionTitle sub="出会った日から、毎月お花を育ててるよ">
        ここあのお花畑
      </SectionTitle>
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <div
          className="relative flex h-36 items-end justify-center overflow-hidden rounded-[var(--radius)]"
          style={{ backgroundColor: g.flower.tint }}
          aria-hidden="true"
        >
          <span className="absolute right-3 top-2 text-2xl">☀️</span>
          {g.stage === "bloom" && (
            <>
              <span className="absolute left-4 top-6 text-xl">{g.flower.emoji}</span>
              <span className="absolute right-10 top-10 text-lg">{g.flower.emoji}</span>
              <span className="absolute bottom-10 left-8 text-lg">{g.flower.emoji}</span>
            </>
          )}
          <span className="absolute bottom-9 text-6xl leading-none">
            {bigEmoji}
          </span>
          <div className="absolute bottom-0 h-9 w-full bg-[#b98a5e]/50" />
          <span className="absolute bottom-1 text-xl">🌱 🌿 🌱</span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-[family-name:var(--font-diary)] text-lg font-black">
            {g.flower.name}
          </h3>
          <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-0.5 text-xs font-bold text-[var(--caramel)]">
            {g.cycleMonth}ヶ月目のお花
          </span>
          <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-0.5 text-xs font-bold text-[var(--accent-deep)]">
            {STAGE_LABEL[g.stage]}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--dim)]">
          {monthDayLabel(g.cycleStart)}〜{monthDayLabel(g.cycleEnd)} ・
          サイクル{g.dayInCycle}日目 ・{" "}
          {g.stage === "bloom"
            ? "いま開花中だよ"
            : `開花まであと${g.daysToBloom}日`}
        </p>
        <p className="mt-2 text-sm leading-6">
          <span className="font-bold text-[var(--caramel)]">ここあ：</span>
          {stageOneLiner(g.stage, g.flower.name)}
        </p>
      </div>
    </section>
  );
}

// Wreath album photos, keyed by cycle month number. To add a month's photo:
// import its image file and add one line here — everything else follows.
const WREATH_PHOTOS: Record<number, { src: string; flower: string }> = {
  1: { src: wreathMonth01Cosmos, flower: "コスモス" },
};

function AlbumSection({ today }: { today: string }) {
  const g = gardenStateFor(today);
  const total = Math.max(6, g.cycleMonth);
  const slots = Array.from({ length: total }, (_, i) => i + 1);
  const [open, setOpen] = useState<number | null>(null);
  const openPhoto = open !== null ? WREATH_PHOTOS[open] : undefined;

  return (
    <section aria-label="リース写真アルバム">
      <SectionTitle sub="咲いたお花のリースで記念写真">
        リース写真アルバム
      </SectionTitle>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {slots.map((n) => {
          const photo = WREATH_PHOTOS[n];
          const flower =
            GARDEN_FLOWERS[(n - 1) % GARDEN_FLOWERS.length] ??
            GARDEN_FLOWERS[0];
          // A cycle's photo joins the collection only once that cycle has
          // reached its bloom stage (day 21+), or the cycle is fully past.
          const bloomed =
            n < g.cycleMonth ||
            (n === g.cycleMonth && g.stage === "bloom");
          if (photo && !bloomed) {
            return (
              <li
                key={n}
                className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-center"
                aria-label={`${n}ヶ月目・${flower.name}の写真は開花したら増えるよ`}
              >
                <span aria-hidden="true" className="text-3xl opacity-40">
                  {flower.emoji}
                </span>
                <span className="text-sm font-bold text-[var(--dim)]">
                  {n}ヶ月目・{flower.name}
                </span>
                <span className="text-xs text-[var(--dim)]">
                  開花したら写真が増えるよ
                </span>
              </li>
            );
          }
          if (photo) {
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setOpen(n)}
                  aria-label={`${n}ヶ月目・${photo.flower}のリース写真を大きく見る`}
                  className="block h-full w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-left"
                >
                  <img
                    src={photo.src}
                    alt={`${photo.flower}のリースを身につけたここあ`}
                    className="aspect-square w-full object-cover"
                  />
                  <span className="block px-3 py-2">
                    <span className="block text-sm font-bold leading-tight">
                      {n}ヶ月目・{photo.flower}
                    </span>
                    <span className="block text-xs text-[var(--dim)]">
                      {bloomMonthLabel(n)}に開花
                    </span>
                  </span>
                </button>
              </li>
            );
          }
          return (
            <li
              key={n}
              className="flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 text-center"
              aria-label={`${n}ヶ月目・${flower.name}の写真はこれから`}
            >
              <span aria-hidden="true" className="text-3xl opacity-40">
                {flower.emoji}
              </span>
              <span className="text-sm font-bold text-[var(--dim)]">
                {n}ヶ月目・{flower.name}
              </span>
              <span className="text-xs text-[var(--dim)]">
                {n === g.cycleMonth && g.stage !== "bloom"
                  ? `いま${STAGE_LABEL[g.stage]}・これから咲くよ`
                  : "これから"}
              </span>
            </li>
          );
        })}
      </ul>

      {open !== null && openPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${open}ヶ月目・${openPhoto.flower}のリース写真`}
          onClick={() => setOpen(null)}
        >
          <figure
            className="w-full max-w-md overflow-hidden rounded-[var(--radius)] bg-[var(--surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={openPhoto.src}
              alt={`${openPhoto.flower}のリースを身につけたここあ`}
              className="w-full object-cover"
            />
            <figcaption className="flex items-center justify-between px-4 py-3">
              <span>
                <span className="block font-[family-name:var(--font-diary)] text-base font-black">
                  {open}ヶ月目・{openPhoto.flower}
                </span>
                <span className="block text-xs text-[var(--dim)]">
                  {bloomMonthLabel(open)}に開花したお花のリース
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="shrink-0 rounded-full bg-[var(--surface-alt)] px-4 py-2 text-sm font-bold"
              >
                閉じる
              </button>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </section>
  );
}

function SectionTitle({ children, sub }: { children: string; sub?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-4 w-10 -rotate-2 rounded-sm bg-[var(--tape)]"
      />
      <h2 className="font-[family-name:var(--font-diary)] text-xl font-black">
        {children}
      </h2>
      {sub ? <span className="text-xs text-[var(--dim)]">{sub}</span> : null}
    </div>
  );
}

// ── カレンダー（ひと目でわかる月表示） ───────────────────────────────

type DayItem =
  | { kind: "anniversary"; label: string }
  | { kind: "cycleStart"; label: string }
  | { kind: "bloom"; label: string }
  | { kind: "diary"; label: string; entryId: number; body: string }
  | { kind: "memo"; label: string; body: string }
  | { kind: "antenna"; label: string; post: AntennaPost }
  | { kind: "spot"; label: string; name: string; area: string; url: string };

const KIND_ICON: Record<DayItem["kind"], string> = {
  anniversary: "🎂",
  cycleStart: "🌱",
  bloom: "🌸",
  diary: "📖",
  memo: "✏️",
  antenna: "🛍",
  spot: "📍",
};

/** All glanceable items for one date, derived from stored data + date math. */
function dayItemsFor(dateStr: string, diary: Diary): DayItem[] {
  const items: DayItem[] = [];
  const d = parseDate(dateStr);
  const anchor = parseDate(MET_DATE);

  const anniv = anniversaryLabel(dateStr);
  if (anniv) items.push({ kind: "anniversary", label: anniv });
  if (d.getDate() === anchor.getDate() && d.getTime() > anchor.getTime()) {
    const g = gardenStateFor(dateStr);
    items.push({
      kind: "cycleStart",
      label: `${g.cycleMonth}ヶ月目・${g.flower.name}の芽が出る日`,
    });
  }
  if (bloomDateFor(dateStr) === dateStr) {
    const g = gardenStateFor(dateStr);
    items.push({ kind: "bloom", label: `${g.flower.name}が咲く日` });
  }
  for (const e of diary.cocoaEntries) {
    if (e.date === dateStr) {
      items.push({
        kind: "diary",
        label: "ここあの日記があるよ",
        entryId: e.id,
        body: e.body,
      });
    }
  }
  for (const m of diary.memos) {
    if (m.date === dateStr) {
      items.push({ kind: "memo", label: "あなたのメモ", body: m.body });
    }
  }
  for (const p of diary.antennaPosts) {
    if (p.postedDate === dateStr) {
      items.push({
        kind: "antenna",
        label: `${p.shopName} ― ${p.title}`,
        post: p,
      });
    }
  }
  for (const s of diary.spotPicks) {
    if (s.forDate === dateStr) {
      items.push({
        kind: "spot",
        label: `${s.name}（${s.area}）`,
        name: s.name,
        area: s.area,
        url: s.sourceUrl,
      });
    }
  }
  return items;
}

/** Small marks shown inside a calendar cell, in display order. */
function marksFor(dateStr: string, diary: Diary): string[] {
  const marks: string[] = [];
  if (anniversaryLabel(dateStr)) marks.push("🎂");
  const d = parseDate(dateStr);
  if (d.getDate() === 23 && d.getTime() > parseDate(MET_DATE).getTime())
    marks.push("🌱");
  if (bloomDateFor(dateStr) === dateStr) marks.push("🌸");
  if (diary.cocoaEntries.some((e) => e.date === dateStr)) marks.push("📖");
  if (diary.antennaPosts.some((p) => p.postedDate === dateStr))
    marks.push("🛍");
  if (diary.spotPicks.some((s) => s.forDate === dateStr)) marks.push("📍");
  if (diary.memos.some((m) => m.date === dateStr)) marks.push("✏️");
  return marks;
}

function DayPanel({
  dateStr,
  diary,
  onGoDiary,
}: {
  dateStr: string;
  diary: Diary;
  onGoDiary: () => void;
}) {
  const items = dayItemsFor(dateStr, diary);
  const [openDiary, setOpenDiary] = useState<number | null>(null);
  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
      <h3 className="font-[family-name:var(--font-diary)] text-base font-black">
        {formatDateLabel(dateStr)}
        {dateStr === diary.today ? (
          <span className="ml-2 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-bold text-[var(--accent-deep)]">
            今日
          </span>
        ) : null}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--dim)]">
          この日はまだ何もないよ。
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, i) => {
            const icon = KIND_ICON[item.kind];
            if (item.kind === "diary") {
              const open = openDiary === item.entryId;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setOpenDiary(open ? null : item.entryId)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 text-left text-sm font-bold"
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <span className="text-xs text-[var(--dim)]">
                      {open ? "とじる" : "読む"}
                    </span>
                  </button>
                  {open ? (
                    <div className="mt-1.5 pl-7">
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {item.body}
                      </p>
                      <button
                        type="button"
                        onClick={onGoDiary}
                        className="mt-1 text-xs font-bold text-[var(--accent-deep)] underline underline-offset-2"
                      >
                        日記タブでひらく
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            }
            if (item.kind === "memo") {
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span aria-hidden="true">{icon}</span>
                  <span className="min-w-0">
                    <span className="font-bold">{item.label}</span>
                    <span className="block whitespace-pre-wrap leading-6">
                      {item.body}
                    </span>
                  </span>
                </li>
              );
            }
            if (item.kind === "antenna") {
              return (
                <li key={i}>
                  <a
                    href={item.post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm"
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span className="min-w-0 flex-1 font-bold leading-snug">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--dim)]">
                      Instagram
                    </span>
                  </a>
                </li>
              );
            }
            if (item.kind === "spot") {
              return (
                <li key={i}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm"
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span className="min-w-0 flex-1 font-bold leading-snug">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--dim)]">
                      くわしく
                    </span>
                  </a>
                </li>
              );
            }
            return (
              <li key={i} className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden="true">{icon}</span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type UpItem = { date: string; icon: string; label: string };

/** Next dated things from today onward, for the glanceable strip. */
function upcomingItems(diary: Diary): UpItem[] {
  const today = parseDate(diary.today);
  // Guaranteed milestones: the next anniversary (🎂, the next 23rd) and the
  // next bloom day (🌸) always appear, whatever else competes for slots.
  const mandatory: UpItem[] = [];
  for (let k = 0; k < 4; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, 23);
    if (d.getTime() < today.getTime()) continue;
    const iso = toISODate(d);
    const label = anniversaryLabel(iso);
    if (label) {
      mandatory.push({ date: iso, icon: "🎂", label });
      break;
    }
  }
  for (let k = 0; k < 3; k++) {
    const bloom = bloomDateFor(toISODate(addDays(today, k * 31)));
    if (bloom >= diary.today) {
      const g = gardenStateFor(bloom);
      mandatory.push({ date: bloom, icon: "🌸", label: `${g.flower.name}が咲く日` });
      break;
    }
  }

  const others: UpItem[] = [];
  // The following anniversary and bloom day, when there is room.
  let extraAnniv = 0;
  for (let k = 0; k < 5 && extraAnniv < 1; k++) {
    const d = new Date(today.getFullYear(), today.getMonth() + k, 23);
    if (d.getTime() < today.getTime()) continue;
    const iso = toISODate(d);
    if (mandatory.some((m) => m.date === iso && m.icon === "🎂")) continue;
    const label = anniversaryLabel(iso);
    if (label) {
      others.push({ date: iso, icon: "🎂", label });
      extraAnniv += 1;
    }
  }
  const seenBloom = new Set(mandatory.map((m) => m.date));
  for (let k = 0; k < 4; k++) {
    const bloom = bloomDateFor(toISODate(addDays(today, k * 31)));
    if (bloom >= diary.today && !seenBloom.has(bloom)) {
      seenBloom.add(bloom);
      const g = gardenStateFor(bloom);
      others.push({ date: bloom, icon: "🌸", label: `${g.flower.name}が咲く日` });
      break;
    }
  }
  // Antenna shop news: the two most recent posts, keyed by their posted
  // date (posts carry no event period, so no future date is invented).
  const recentPosts = [...diary.antennaPosts]
    .sort((a, b) =>
      a.postedDate < b.postedDate ? 1 : a.postedDate > b.postedDate ? -1 : 0,
    )
    .slice(0, 2);
  for (const p of recentPosts) {
    others.push({
      date: p.postedDate,
      icon: "🛍",
      label: `${p.shopName} ― ${p.title}`,
    });
  }
  // Spot picks are daily picks, not future events: at most one 📍 item —
  // the earliest upcoming date's first pick (today's, normally).
  const spotDates = [
    ...new Set(
      diary.spotPicks
        .filter((s) => s.forDate >= diary.today)
        .map((s) => s.forDate),
    ),
  ].sort();
  const spotDate = spotDates[0];
  if (spotDate) {
    const s = diary.spotPicks.find((sp) => sp.forDate === spotDate);
    if (s) {
      others.push({
        date: s.forDate,
        icon: "📍",
        label: `${s.name}（${s.area}）`,
      });
    }
  }
  if (diary.yearEnd >= diary.today) {
    others.push({ date: diary.yearEnd, icon: "🎍", label: "大晦日・2026年おわり" });
  }

  const byDate = (a: UpItem, b: UpItem) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  others.sort(byDate);
  const CAP = 7;
  const merged = [...mandatory, ...others.slice(0, CAP - mandatory.length)];
  merged.sort(byDate);
  return merged.slice(0, CAP);
}

// ── 今日のるーむ（相互連携ダイジェスト） ───────────────────────────

const ROOM_KIND_ICON: Record<RoomToday["posts"][number]["kind"], string> = {
  weather: "☀️",
  trend: "💖",
  spot: "🎪",
  anniv: "🎂",
  other: "💬",
};

/** Compact digest of ここらて♡るーむ's today, from the shared-context
 *  cache in getDiary. The card only renders when the room's context was
 *  actually read; each row jumps over to the room. */
function RoomDigestCard({ room }: { room: RoomToday }) {
  const rows = [...room.posts];
  if (room.weatherLine && !rows.some((p) => p.kind === "weather")) {
    rows.unshift({ kind: "weather" as const, label: room.weatherLine });
  }
  if (rows.length === 0 && !room.anniversaryLabel) return null;
  return (
    <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="font-[family-name:var(--font-diary)] text-base font-black">
          💬 今日のるーむ
        </h3>
        {room.anniversaryLabel ? (
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-deep)]">
            🎂 {room.anniversaryLabel}
          </span>
        ) : null}
      </div>
      <ul className="mt-1.5">
        {rows.map((p, i) => (
          <li key={i}>
            <a
              href={ROOM_URL}
              aria-label={`ここらて♡るーむで「${p.label}」を見る`}
              className="flex items-center gap-2 py-1 text-sm"
            >
              <span aria-hidden="true">{ROOM_KIND_ICON[p.kind]}</span>
              <span className="min-w-0 flex-1 truncate font-bold leading-snug">
                {p.label}
              </span>
              <span aria-hidden="true" className="shrink-0 text-xs text-[var(--dim)]">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarSection({
  diary,
  onGoDiary,
}: {
  diary: Diary;
  onGoDiary: () => void;
}) {
  const todayD = parseDate(diary.today);
  const [view, setView] = useState({
    y: todayD.getFullYear(),
    m: todayD.getMonth(),
  });
  const [selected, setSelected] = useState(diary.today);

  const first = new Date(view.y, view.m, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toISODate(new Date(view.y, view.m, i + 1)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const move = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const upcoming = upcomingItems(diary);

  return (
    <section aria-label="カレンダー">
      {diary.roomToday ? <RoomDigestCard room={diary.roomToday} /> : null}
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="前の月"
            className="rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-sm font-bold"
          >
            ←
          </button>
          <h3 className="font-[family-name:var(--font-diary)] text-lg font-black">
            {view.y}年{view.m + 1}月
          </h3>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="次の月"
            className="rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-sm font-bold"
          >
            →
          </button>
        </div>

        <div
          className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--dim)]"
          aria-hidden="true"
        >
          {WEEKDAYS.map((w, i) => (
            <span
              key={w}
              className={i === 0 ? "text-[var(--accent-deep)]" : i === 6 ? "text-[var(--caramel)]" : ""}
            >
              {w}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <span key={i} aria-hidden="true" />;
            const marks = marksFor(iso, diary);
            const isToday = iso === diary.today;
            const isSel = iso === selected;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                aria-label={`${formatDateLabel(iso)}${marks.length ? `：${marks.join(" ")}` : ""}`}
                aria-pressed={isSel}
                className={`flex min-h-12 flex-col items-center rounded-lg px-0.5 py-1 ${
                  isSel
                    ? "bg-[var(--surface-alt)] ring-2 ring-[var(--accent)]"
                    : isToday
                      ? "bg-[var(--surface-alt)]"
                      : ""
                }`}
              >
                <span
                  className={`text-sm leading-none ${
                    isToday
                      ? "font-black text-[var(--accent-deep)]"
                      : "font-bold"
                  }`}
                >
                  {parseDate(iso).getDate()}
                </span>
                <span
                  className="mt-1 flex min-h-4 flex-wrap items-center justify-center gap-x-0.5 text-[10px] leading-none"
                  aria-hidden="true"
                >
                  {marks.slice(0, 4).map((mk, j) => (
                    <span key={j}>{mk}</span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--dim)]">
          <span>📖 日記</span>
          <span>🛍 アンテナ便り</span>
          <span>📍 スポット</span>
          <span>🎂 記念日</span>
          <span>🌸 開花</span>
          <span>🌱 芽の日</span>
          <span>✏️ メモ</span>
        </p>
      </div>

      <DayPanel dateStr={selected} diary={diary} onGoDiary={onGoDiary} />

      {upcoming.length > 0 && (
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          <h3 className="font-[family-name:var(--font-diary)] text-base font-black">
            これからの予定
          </h3>
          <ul className="mt-2 space-y-1.5">
            {upcoming.map((u, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    const d = parseDate(u.date);
                    setView({ y: d.getFullYear(), m: d.getMonth() });
                    setSelected(u.date);
                  }}
                  className="flex w-full items-center gap-2 text-left text-sm"
                >
                  <span aria-hidden="true">{u.icon}</span>
                  <span className="shrink-0 font-bold text-[var(--caramel)]">
                    {shortDateLabel(u.date)}（{WEEKDAYS[parseDate(u.date).getDay()] ?? ""}）
                  </span>
                  <span className="min-w-0 flex-1 font-bold leading-snug">
                    {u.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── 日記タブ ─────────────────────────────────────────────────────────

/** Deterministic glance tags for one diary date. For today only, the
 *  weather tag comes from ここらて♡るーむ's shared context, so both
 *  spaces show the SAME weather line (silently absent when unread). */
function diaryDayTags(dateStr: string, diary: Diary): string[] {
  const g = gardenStateFor(dateStr);
  const stageIcon =
    g.stage === "bloom" ? g.flower.emoji : STAGE_EMOJI[g.stage];
  const tags: string[] = [`${stageIcon} ${g.flower.name}・${STAGE_LABEL[g.stage]}`];
  if (dateStr === diary.today && diary.roomToday?.weatherLine) {
    tags.unshift(`☀️ ${diary.roomToday.weatherLine}`);
  }
  if (diary.antennaPosts.some((p) => p.postedDate === dateStr))
    tags.push("🛍 お便りあり");
  if (diary.spotPicks.some((s) => s.forDate === dateStr))
    tags.push("📍 スポットあり");
  const memoCount = diary.memos.filter((m) => m.date === dateStr).length;
  if (memoCount > 0) tags.push(`✏️ メモ${memoCount}件`);
  return tags;
}

function MemoComposer({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: (body: string) => api.addMemo({ body }),
    onSuccess: () => {
      setText("");
      onDone();
    },
  });
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = text.trim();
        if (body) add.mutate(body);
      }}
    >
      <label htmlFor="memo-input" className="text-sm font-bold">
        今日のメモを書く
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="memo-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="例：いしかわテラスの新商品、見に行きたい"
          className="min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={!text.trim() || add.isPending}
          className="shrink-0 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {add.isPending ? "保存中…" : "書く"}
        </button>
      </div>
      {add.isError ? (
        <p className="mt-1 text-xs text-[var(--accent-deep)]">
          保存できませんでした。もう一度試してみてね。
        </p>
      ) : null}
    </form>
  );
}

function DiaryEntryCard({
  date,
  body,
  diary,
  defaultOpen,
}: {
  date: string;
  body: string;
  diary: Diary;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tags = diaryDayTags(date, diary);
  return (
    <article className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${formatDateLabel(date)}の日記を${open ? "とじる" : "ひらく"}`}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
      >
        <span className="text-sm font-bold">{formatDateLabel(date)}</span>
        <span className="text-xs text-[var(--dim)]">・ ここあ</span>
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-bold text-[var(--caramel)]"
          >
            {t}
          </span>
        ))}
        <span className="ml-auto text-xs font-bold text-[var(--dim)]">
          {open ? "とじる" : "ひらく"}
        </span>
      </button>
      {open ? (
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7">
          {body}
        </p>
      ) : null}
    </article>
  );
}

function DiarySection({
  diary,
  invalidate,
}: {
  diary: Diary;
  invalidate: () => void;
}) {
  const del = useMutation({
    mutationFn: (id: number) => api.deleteMemo({ id }),
    onSuccess: invalidate,
  });
  const latest = diary.cocoaEntries[0];
  const past = diary.cocoaEntries.slice(1);

  return (
    <section aria-label="ここあの日記">
      {latest ? (
        <div className="ruled rounded-[var(--radius)]">
          <DiaryEntryCard
            date={latest.date}
            body={latest.body}
            diary={diary}
            defaultOpen
          />
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center text-sm text-[var(--dim)]">
          {diary.refreshStatus === "running"
            ? "今日の日記を書いているところ…少し待ってね。"
            : "今日の日記はまだ書かれていないよ。下の「更新する」でもう一度集めてみてね。"}
        </div>
      )}

      {diary.memos.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="あなたのメモ">
          {diary.memos.map((memo: Memo) => (
            <li
              key={memo.id}
              className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--caramel)]">
                  ✏️ あなたのメモ ・ {formatDateLabel(memo.date)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-6">
                  {memo.body}
                </p>
              </div>
              <button
                type="button"
                aria-label={`メモ「${memo.body.slice(0, 12)}」を削除`}
                onClick={() => del.mutate(memo.id)}
                disabled={del.isPending}
                className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-[var(--dim)]"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <MemoComposer onDone={invalidate} />

      {past.length > 0 && (
        <div className="mt-5 space-y-2.5">
          <h3 className="font-[family-name:var(--font-diary)] text-base font-black">
            前の日記
          </h3>
          {past.map((e) => (
            <DiaryEntryCard
              key={e.id}
              date={e.date}
              body={e.body}
              diary={diary}
              defaultOpen={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── アンテナ＆スポットタブ ───────────────────────────────────────────

/** Category icon guessed from the post's own title/summary wording. */
function antennaCategoryIcon(p: AntennaPost): string {
  const text = `${p.title} ${p.summary}`;
  if (/フェア|マルシェ/.test(text)) return "🎪";
  if (/イベント|催し|まつり|祭|ライブ|体験/.test(text)) return "📣";
  if (/新商品|新発売|入荷|限定|発売/.test(text)) return "✨";
  if (/キャンペーン|割引|セール|お得/.test(text)) return "🏷️";
  return "🛍";
}

function spotCategoryIcon(name: string, note: string): string {
  const text = `${name} ${note}`;
  if (/イルミネーション|ライトアップ/.test(text)) return "✨";
  if (/市|マルシェ|フェア/.test(text)) return "🎪";
  if (/展|美術|博物/.test(text)) return "🖼️";
  if (/まつり|祭|イベント/.test(text)) return "📣";
  return "📍";
}

function AntennaPostItem({
  post,
  today,
}: {
  post: AntennaPost;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const chip =
    post.postedDate === today
      ? "今日のお知らせ"
      : `${shortDateLabel(post.postedDate)}の投稿`;
  return (
    <li className="border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${post.title}の${open ? "詳細をとじる" : "詳細をひらく"}`}
        className="flex w-full items-start gap-2 text-left"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          {antennaCategoryIcon(post)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-snug">
            {post.title}
          </span>
          <span className="mt-1 inline-block rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[11px] font-bold text-[var(--caramel)]">
            {chip}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-[var(--dim)]">
          {open ? "とじる" : "くわしく"}
        </span>
      </button>
      {open ? (
        <div className="mt-1.5 pl-7">
          <p className="text-sm leading-6">{post.summary}</p>
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-bold text-[var(--accent-deep)] underline decoration-[var(--tape)] decoration-2 underline-offset-2"
          >
            Instagramで見る
          </a>
        </div>
      ) : null}
    </li>
  );
}

function AntennaSpotTab({ diary }: { diary: Diary }) {
  const grouped = useMemo(() => {
    const map = new Map<string, AntennaPost[]>();
    for (const p of diary.antennaPosts) {
      const list = map.get(p.username) ?? [];
      list.push(p);
      map.set(p.username, list);
    }
    return [...map.values()];
  }, [diary.antennaPosts]);

  return (
    <div>
      <section aria-label="アンテナショップ便り">
        {grouped.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center text-sm text-[var(--dim)]">
            {diary.refreshStatus === "running"
              ? "5店舗の新しい投稿を集めているところ…"
              : "まだお便りが届いていないよ。更新が終わると、ここに新着が並ぶよ。"}
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((posts) => {
              const head = posts[0];
              if (!head) return null;
              return (
                <article
                  key={head.username}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
                >
                  <header className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] font-[family-name:var(--font-diary)] text-base font-black text-[var(--caramel)]"
                    >
                      {shopInitial(head.shopName)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-bold leading-tight">
                        {head.shopName}
                      </h3>
                      <p className="text-xs text-[var(--dim)]">
                        {head.prefecture} ・ @{head.username} ・ お便り
                        {posts.length}件
                      </p>
                    </div>
                  </header>
                  <ul className="mt-3 space-y-3">
                    {posts.map((p) => (
                      <AntennaPostItem key={p.id} post={p} today={diary.today} />
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="近場スポット" className="mt-6">
        <h3 className="mb-2.5 font-[family-name:var(--font-diary)] text-lg font-black">
          📍 今日の近場スポット
          <span className="ml-2 text-xs font-medium text-[var(--dim)]">
            電車代だけで行ける距離から
          </span>
        </h3>
        {diary.spotPicks.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center text-sm text-[var(--dim)]">
            {diary.refreshStatus === "running"
              ? "今日のおでかけ候補を探しているところ…"
              : "今日の候補はまだないよ。更新すると、近場のスポットが並ぶよ。"}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {diary.spotPicks.map((s) => (
              <li
                key={s.id}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
              >
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span aria-hidden="true" className="text-lg leading-none">
                      {spotCategoryIcon(s.name, s.note)}
                    </span>
                    <span className="font-[family-name:var(--font-diary)] text-base font-black">
                      {s.name}
                    </span>
                    <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-bold text-[var(--caramel)]">
                      {s.area}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-6">{s.note}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--accent-deep)]">
                    くわしく見る（出典ページ）
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── タブと全体 ───────────────────────────────────────────────────────

type TabKey = "calendar" | "diary" | "garden" | "antenna";

const TABS: { key: TabKey; label: string }[] = [
  { key: "calendar", label: "📅 カレンダー" },
  { key: "diary", label: "📖 日記" },
  { key: "garden", label: "🌸 お花畑" },
  { key: "antenna", label: "🛍 アンテナ" },
];

export function App() {
  const queryClient = useQueryClient();
  const diary = useQuery({
    queryKey: ["diary"],
    queryFn: () => api.getDiary({}),
    refetchInterval: (query) =>
      query.state.data?.refreshStatus === "running" ||
      query.state.data?.roomFetchStatus === "running"
        ? 5000
        : false,
  });

  const ensure = useMutation({
    mutationFn: () => api.ensureToday({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary"] }),
  });
  const ensureRoom = useMutation({
    mutationFn: () => api.ensureRoomContext({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary"] }),
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshDiary({ force: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diary"] }),
  });

  const [tab, setTab] = useState<TabKey>("calendar");

  const data = diary.data;
  // Auto-kick today's refresh once per JST date per page session;
  // refreshDiary itself dedupes server-side, so this stays cheap.
  const ensuredDates = useRef(new Set<string>());
  useEffect(() => {
    if (!data || data.refreshStatus === "running" || ensure.isPending) return;
    if (ensuredDates.current.has(data.today)) return;
    ensuredDates.current.add(data.today);
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.today, data?.refreshStatus]);

  // Same once-per-date kick for the room's shared today context; the
  // server dedupes and throttles, and any failure just leaves the
  // digest card hidden.
  const roomEnsuredDates = useRef(new Set<string>());
  useEffect(() => {
    if (!data || data.roomToday || data.roomFetchStatus === "running") return;
    if (ensureRoom.isPending) return;
    if (roomEnsuredDates.current.has(data.today)) return;
    roomEnsuredDates.current.add(data.today);
    ensureRoom.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.today, data?.roomToday, data?.roomFetchStatus]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["diary"] });

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4">
        {diary.isPending ? (
          <p className="py-16 text-center text-sm text-[var(--dim)]">
            ダイアリーをひらいているよ…
          </p>
        ) : diary.isError || !data ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[var(--dim)]">
              ダイアリーが開けなかったよ。
            </p>
            <button
              type="button"
              onClick={() => diary.refetch()}
              className="mt-3 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
            >
              もう一度ひらく
            </button>
          </div>
        ) : (
          <>
            <CountdownHero diary={data} />

            <div className="mt-3 flex justify-end">
              <a
                href={ROOM_URL}
                aria-label="ここらて♡るーむへ移動する"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--accent-deep)]"
              >
                💬 ここらて♡るーむ
                <span aria-hidden="true" className="text-[var(--dim)]">
                  ›
                </span>
              </a>
            </div>

            <div
              role="tablist"
              aria-label="ダイアリーのタブ"
              className="sticky top-2 z-40 mt-4 grid grid-cols-4 gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-lg px-1 py-2 text-[13px] font-bold leading-tight ${
                    tab === t.key
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--dim)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "calendar" && (
                <CalendarSection
                  diary={data}
                  onGoDiary={() => setTab("diary")}
                />
              )}
              {tab === "diary" && (
                <DiarySection diary={data} invalidate={invalidate} />
              )}
              {tab === "garden" && (
                <>
                  <GardenSection today={data.today} />
                  <AlbumSection today={data.today} />
                </>
              )}
              {tab === "antenna" && <AntennaSpotTab diary={data} />}
            </div>

            <footer className="mt-10 border-t border-[var(--border)] pt-4 text-center">
              <p className="text-xs text-[var(--dim)]">
                {data.lastRunDate
                  ? `最終更新：${formatDateLabel(data.lastRunDate)}の朝`
                  : "まだ更新されていないよ"}
                {data.refreshStatus === "running" ? " ・ 更新中…" : ""}
              </p>
              {data.lastError ? (
                <p className="mt-1 text-xs text-[var(--accent-deep)]">
                  前回の更新がうまくいかなかったみたい。もう一度試してみてね。
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending || data.refreshStatus === "running"}
                className="mt-3 rounded-full border border-[var(--accent)] px-5 py-2 text-sm font-bold text-[var(--accent-deep)] disabled:opacity-40"
              >
                {data.refreshStatus === "running"
                  ? "更新中…"
                  : "いま更新する"}
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
