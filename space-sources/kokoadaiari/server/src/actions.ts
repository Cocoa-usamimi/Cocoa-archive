// Actions for ここあダイアリー.
//
// Data flow:
// - getDiary: the one read the client renders from.
// - refreshDiary: starts (or resumes) a background agent task that reads
// the five antenna shops' Instagram posts and searches the web for
// Tokyo near spots, then writes back through saveRefresh.
// - saveRefresh: validates, dedupes and stores one day's gathered content,
// and composes ここあ's diary entry for the day.
// - ensureToday: client calls this on open; if today's refresh has not
// run yet, it kicks refreshDiary (deduped by date).
// - addMemo / deleteMemo: the user's own diary memos.
// - getSharedTodayContext: publishes this diary's "today context" for
//   ここらて♡るーむ (phase-1 interlinking).
// - ensureRoomContext / saveRoomContext: fetch and cache the room's
//   matching shared context via a background task; failures degrade to
//   "no room context" and never block the diary.

import {
defineAction,
z,
type ActionsModule,
type Ctx,
} from "@hatch/space-sdk";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import {
  daysSinceMeeting,
  gardenCycleFor,
  isAnniversaryDay,
} from "./garden";

const SHOPS = [
{ name: "八重洲いしかわテラス", prefecture: "石川県", username: "ishikawa_antenna"},
{ name: "日比谷しまね館", prefecture: "島根県", username: "shimanekan"},
{ name: "北海道どさんこプラザ", prefecture: "北海道", username: "hokkaido_hyakka"},
{ name: "銀座・新潟情報館 THE NIIGATA", prefecture: "新潟県", username: "the_niigata"},
{ name: "ふくい食の國291", prefecture: "福井県", username: "fukui_antennashop291"},
] as const;

const YEAR_END = "2026-12-31";

/** Today's date in Asia/Tokyo as "YYYY-MM-DD". */
function jstToday(): string {
return new Intl.DateTimeFormat("en-CA", {
timeZone: "Asia/Tokyo",
year: "numeric",
month: "2-digit",
day: "2-digit",
}).format(new Date());
}

/** Whole days from `date` (YYYY-MM-DD) to 2026-12-31, date-only math. */
function daysLeftFrom(date: string): number {
const [y = 2026, m = 1, d = 1] = date.split("-").map(Number);
const from = Date.UTC(y, m - 1, d);
const to = Date.UTC(2026, 11, 31);
return Math.round((to - from) / 86_400_000);
}

const HITOKOTO_TODAY_ACTIVITIES = [
"大掃除の計画を少しだけ立てて",
"今年の思い出の写真を見返して",
"年末に食べたいものの候補をメモして",
"お正月の過ごし方をぼんやり考えて",
"今年がんばったことをノートに書き出して",
"クリスマスの飾りをどこに置くか考えて",
"年賀状の文面を少し考えて",
"冬のあったかドリンクのレシピを調べて",
"今年買ってよかったものを思い出して",
"大晦日に聞きたい曲を選んで",
] as const;

/** Picks one of the year-end-aware daily activities, stable per date. */
function hitokotoActivity(date: string): string {
const [y = 2026, m = 1, d = 1] = date.split("-").map(Number);
const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
const len = HITOKOTO_TODAY_ACTIVITIES.length;
const idx = ((dayIndex % len) + len) % len;
return HITOKOTO_TODAY_ACTIVITIES[idx] ?? HITOKOTO_TODAY_ACTIVITIES[0];
}

type Db = ReturnType<Ctx["db"]>;

async function readState(db: Db) {
const rows = await db
.select()
.from(schema.refreshState)
.where(eq(schema.refreshState.id, 1))
.limit(1);
return rows[0]?? null;
}

async function writeState(
db: Db,
patch: Partial<{
status: string;
taskId: string | null;
startedAt: Date | null;
lastRunDate: string | null;
lastError: string | null;
}>,
) {
const existing = await readState(db);
if (existing) {
await db
.update(schema.refreshState)
.set(patch)
.where(eq(schema.refreshState.id, 1));
} else {
await db.insert(schema.refreshState).values({ id: 1,...patch});
}
}

// ── ここらて♡るーむ shared "today context" ─────────────────────────
// Phase-1 interlinking: this space publishes getSharedTodayContext and
// consumes the room's matching one. Consumption goes through a background
// task (the room lives in another space, so only an agent can read its
// published action) that saves via saveRoomContext into a local cache.
// Every failure mode degrades to "no room context" — the diary never
// blocks or errors because the room is unreachable.

const ROOM_SLUG = "kokoanosns";
const ROOM_RETRY_MS = 30 * 60 * 1000;

const roomPostKind = z.enum(["weather", "trend", "spot", "anniv", "other"]);
type RoomPostKind = z.infer<typeof roomPostKind>;

type RoomToday = {
weatherLine: string | null;
posts: { kind: RoomPostKind; label: string }[];
anniversaryLabel: string | null;
};

type DbRoom = ReturnType<Ctx["db"]>;

async function readRoomCache(db: DbRoom) {
const rows = await db
.select()
.from(schema.roomContextCache)
.where(eq(schema.roomContextCache.id, 1))
.limit(1);
return rows[0]?? null;
}

async function writeRoomCache(
db: DbRoom,
patch: Partial<{
date: string | null;
available: number;
weatherLine: string | null;
postsJson: string | null;
anniversaryLabel: string | null;
status: string;
taskId: string | null;
lastAttemptAt: Date | null;
}>,
) {
const existing = await readRoomCache(db);
if (existing) {
await db
.update(schema.roomContextCache)
.set(patch)
.where(eq(schema.roomContextCache.id, 1));
} else {
await db.insert(schema.roomContextCache).values({ id: 1,...patch});
}
}

function parseRoomPosts(json: string | null): RoomToday["posts"] {
if (!json) return [];
try {
const raw: unknown = JSON.parse(json);
if (!Array.isArray(raw)) return [];
const out: RoomToday["posts"] = [];
for (const item of raw) {
if (typeof item!== "object" || item === null) continue;
const rec = item as Record<string, unknown>;
const label = rec.label;
if (typeof label!== "string" || label.length === 0) continue;
const kind =
typeof rec.kind === "string" &&
(roomPostKind.options as readonly string[]).includes(rec.kind)
? (rec.kind as RoomPostKind)
: "other";
out.push({ kind, label});
}
return out.slice(0, 5);
} catch {
return [];
}
}

const refreshResponse = z.object({
started: z.boolean(),
reason: z.string(),
});

type RefreshResult = z.infer<typeof refreshResponse>;

async function startRefresh(
ctx: Ctx,
opts: { force: boolean},
): Promise<RefreshResult> {
const db = ctx.db<typeof schema>();
const today = jstToday();
const state = await readState(db);

if (!opts.force && state?.lastRunDate === today) {
return { started: false, reason: "already_refreshed_today"};
}
if (state?.status === "running" && state.taskId) {
const st = await ctx.agent.status(state.taskId).catch(() => null);
if (st && (st.status === "queued" || st.status === "running")) {
return { started: false, reason: "already_running"};
}
}

const shopList = SHOPS.map(
(s) => `- ${s.name}（${s.prefecture}）: @${s.username}`,
).join("\n");

const message = [
`今日は ${today}（日本時間）です。「ここあダイアリー」の朝の更新のために、次の2つを集めてください。`,
``,
``,
`ユーザーがInstagramでフォローしている次の5店舗について、instagram-cli で最新投稿を確認してください。`,
`まず \`/opt/hatch/bin/instagram-cli accounts\` で接続中アカウントの user_fbid を取得し、次に posts コマンドで5店舗分まとめて読んでください（例: posts --account-id <fbid> --username ishikawa_antenna,shimanekan,hokkaido_hyakka,the_niigata,fukui_antennashop291 --limit 5 --post-types POST,REEL）。`,
shopList,
`各店舗について、直近14日以内の投稿から最大2件を選び、キャプションから読み取れる事実（イベント名・期間・新商品・キャンペーンなど）だけをもとに、title（25字以内の見出し）と summary（1〜2文の要約）を日本語で作ってください。キャプションの丸写しは禁止です。事実が読み取れない投稿は選ばないでください。`,
`postKey には投稿の post_id、postedDate には post_created_at の日本時間の日付（YYYY-MM-DD）、url には投稿URLをそのまま入れてください。URLが無い投稿は含めないでください。`,
``,
``,
`TOKYO CHEAPO（tokyocheapo.com）を中心にウェブ検索し、東京近郊で今の時期に行ける、低コストで気軽なおでかけスポットや期間限定イベントを3〜4件探してください（イルミネーション、蚤の市、無料・安価な展示、季節のイベントなど）。`,
`各スポットに name（名称）、area（エリア名）、note（1文の紹介。料金や開催日に触れる場合は検索結果で確認できた場合のみ）、sourceUrl（検索結果に表示された記事URLを一字一句そのまま）を付けてください。確認できない情報は書かないでください。`,
``,
`あわせて、年末カウントダウン欄に表示する「ここあの一言」を1つ考えてください。年末まであと何日かを意識して、「今日は〇〇をして過ごした」という形で、今日集めたお知らせやスポットの内容に触れる、ここあの一言（60字以内、日本語）です。例:「あと40日。今日はしまね館のお知らせをまとめて、年末のおやつ候補をメモして過ごしたよ」。`,
`集まったら、このスペースの saveRefresh アクションを1回だけ呼び、{ date: "${today}", hitokoto: "（一言）", antennaPosts: [...], spotPicks: [...]} を保存してください。片方の収集が失敗しても、もう片方だけでも保存してください。両方とも空の場合は呼ばないでください。`,
].join("\n");

const res = await ctx.agent.spawnTask(message, {
expectsAction: "saveRefresh",
dedupeKey: `diary-refresh-${today}`,
});
if (!res.ok) {
await writeState(db, {
status: "error",
lastError: res.error,
taskId: null,
startedAt: null,
});
return { started: false, reason: `spawn_failed: ${res.error}`};
}
await writeState(db, {
status: "running",
taskId: res.taskId,
startedAt: new Date(),
lastError: null,
});
return { started: true, reason: "started"};
}

async function startRoomFetch(
ctx: Ctx,
): Promise<RefreshResult> {
const db = ctx.db<typeof schema>();
const today = jstToday();
const cache = await readRoomCache(db);

if (cache?.date === today && cache.available === 1) {
return { started: false, reason: "already_fetched_today"};
}
if (cache?.status === "running" && cache.taskId) {
const st = await ctx.agent.status(cache.taskId).catch(() => null);
if (st && (st.status === "queued" || st.status === "running")) {
return { started: false, reason: "already_running"};
}
}
if (
cache?.lastAttemptAt &&
Date.now() - cache.lastAttemptAt.getTime() < ROOM_RETRY_MS
) {
return { started: false, reason: "recent_attempt"};
}

const message = [
`今日は ${today}（日本時間）です。「ここあダイアリー」と「ここらて♡るーむ」（スペース slug: ${ROOM_SLUG}）の相互連携のために、るーむ側の「今日の文脈」を読み取ってください。`,
``,
`手順:`,
`1. artifact の list_actions で slug "${ROOM_SLUG}" のアクション一覧を確認し、getSharedTodayContext というアクションがあるか探してください。`,
`2. あれば artifact の invoke_action で slug "${ROOM_SLUG}"、action_name "getSharedTodayContext"、args {} で呼び、結果を受け取ってください。`,
`3. 結果をもとに、このスペースの saveRoomContext アクションを1回だけ呼び、次の形で保存してください:`,
`   { date: "${today}", available: true, weatherLine: （るーむの今日の天気を表す短い一文。40字以内に収めてください。無ければ null）, posts: [{ kind, label }], anniversaryLabel: （今日が記念日なら、その名称。無ければ null）}`,
`   posts は今日のるーむの投稿の話題を最大4件まで。kind は内容に応じて "weather"（天気）/ "trend"（トレンド）/ "spot"（おでかけ・スポット）/ "anniv"（記念日）/ "other"（その他）から選び、label はその話題が1行でわかる短い文（40字以内）にしてください。本文の丸写しではなく、話題が伝わる要約にしてください。`,
`4. getSharedTodayContext が存在しない、または呼び出しが失敗した場合は、saveRoomContext を { date: "${today}", available: false } で1回だけ呼んでください（無理に内容を作らないでください）。`,
].join("\n");

const res = await ctx.agent.spawnTask(message, {
expectsAction: "saveRoomContext",
dedupeKey: `diary-room-context-${today}`,
});
if (!res.ok) {
await writeRoomCache(db, {
status: "error",
taskId: null,
lastAttemptAt: new Date(),
});
return { started: false, reason: `spawn_failed: ${res.error}`};
}
await writeRoomCache(db, {
status: "running",
taskId: res.taskId,
lastAttemptAt: new Date(),
});
return { started: true, reason: "started"};
}

export const Actions = {
getDiary: defineAction({
description:
"Returns the full diary state: countdown inputs, ここあ's diary entries, user memos, antenna shop posts, today's spot picks, and refresh status.",
request: z.object({}),
response: z.object({
today: z.string(),
yearEnd: z.string(),
daysLeft: z.number(),
hitokoto: z.string(),
refreshStatus: z.string(),
lastRunDate: z.string().nullable(),
lastError: z.string().nullable(),
cocoaEntries: z.array(
z.object({ id: z.number(), date: z.string(), body: z.string()}),
),
memos: z.array(
z.object({ id: z.number(), date: z.string(), body: z.string()}),
),
antennaPosts: z.array(
z.object({
id: z.number(),
shopName: z.string(),
prefecture: z.string(),
username: z.string(),
title: z.string(),
summary: z.string(),
postedDate: z.string(),
url: z.string(),
}),
),
spotPicks: z.array(
z.object({
id: z.number(),
name: z.string(),
area: z.string(),
note: z.string(),
sourceUrl: z.string(),
forDate: z.string(),
}),
),
roomToday: z
.object({
weatherLine: z.string().nullable(),
posts: z.array(
z.object({ kind: roomPostKind, label: z.string()}),
),
anniversaryLabel: z.string().nullable(),
})
.nullable(),
roomFetchStatus: z.string(),
}),
async handler(ctx) {
const db = ctx.db<typeof schema>();
const today = jstToday();
const state = await readState(db);

// If a refresh task finished or failed, fold that back into state.
let status = state?.status?? "idle";
if (status === "running" && state?.taskId) {
const st = await ctx.agent.status(state.taskId).catch(() => null);
if (st && st.status === "failed") {
status = "error";
await writeState(db, {
status: "error",
lastError: st.failureReason?? st.finalResponse?? "refresh failed",
});
} else if (st && st.status === "completed" && state.lastRunDate!== today) {
// Completed without a save for today (nothing found / partial).
status = "idle";
await writeState(db, { status: "idle", taskId: null});
}
}

const entries = await db
.select()
.from(schema.diaryEntries)
.orderBy(desc(schema.diaryEntries.id))
.limit(60);
const posts = await db
.select()
.from(schema.antennaPosts)
.orderBy(desc(schema.antennaPosts.postedDate))
.limit(12);
const spots = await db
.select()
.from(schema.spotPicks)
.orderBy(schema.spotPicks.id)
.limit(8);

const prefectureByUsername = new Map<string, string>(
SHOPS.map((s) => [s.username, s.prefecture]),
);

// ここあの一言 for the countdown hero: today's stored line if the refresh
// composed one, otherwise a deterministic date-seeded fallback so the
// section is never empty.
const todayCocoa = entries.find(
(e) => e.author === "cocoa" && e.date === today,
);
const hitokoto =
todayCocoa?.hitokoto ??
`今日は${hitokotoActivity(today)}過ごしたよ。`;

// ここらて♡るーむ's shared today context (cached). Only today's
// successfully-read cache is exposed; anything else renders as "no
// room context" and the digest card quietly hides.
const roomCache = await readRoomCache(db);
let roomFetchStatus = roomCache?.status?? "idle";
if (roomFetchStatus === "running" && roomCache?.taskId) {
const rst = await ctx.agent.status(roomCache.taskId).catch(() => null);
if (rst && rst.status === "failed") {
roomFetchStatus = "error";
await writeRoomCache(db, { status: "error", taskId: null});
} else if (
rst &&
rst.status === "completed" &&
roomCache.date!== today
) {
// Finished without saving today's context (room unreachable).
roomFetchStatus = "idle";
await writeRoomCache(db, { status: "idle", taskId: null});
}
}
const roomToday: RoomToday | null =
roomCache && roomCache.date === today && roomCache.available === 1
? {
weatherLine: roomCache.weatherLine,
posts: parseRoomPosts(roomCache.postsJson),
anniversaryLabel: roomCache.anniversaryLabel,
}
: null;

return {
today,
yearEnd: YEAR_END,
daysLeft: daysLeftFrom(today),
hitokoto,
refreshStatus: status,
lastRunDate: state?.lastRunDate?? null,
lastError: status === "error"? (state?.lastError?? null): null,
cocoaEntries: entries
.filter((e) => e.author === "cocoa")
.map((e) => ({ id: e.id, date: e.date, body: e.body})),
memos: entries
.filter((e) => e.author === "user")
.map((e) => ({ id: e.id, date: e.date, body: e.body})),
antennaPosts: posts.map((p) => ({
id: p.id,
shopName: p.shopName,
prefecture: prefectureByUsername.get(p.username)?? "",
username: p.username,
title: p.title,
summary: p.summary,
postedDate: p.postedDate,
url: p.url,
})),
spotPicks: spots.map((s) => ({
id: s.id,
name: s.name,
area: s.area,
note: s.note,
sourceUrl: s.sourceUrl,
forDate: s.forDate,
})),
roomToday,
roomFetchStatus,
};
},
}),

getSharedTodayContext: defineAction({
description:
"Publishes this diary's shared 'today context' (diary summary, antenna headlines, today's spot, garden state, meeting counters) so ここらて♡るーむ shows the same today as the diary.",
request: z.object({}),
response: z.object({
date: z.string(),
diary: z.object({
exists: z.boolean(),
summary: z.string().nullable(),
}),
antennaHeadlines: z.array(
z.object({
shopName: z.string(),
title: z.string(),
summary: z.string(),
postedDate: z.string(),
}),
),
spot: z
.object({ name: z.string(), area: z.string(), note: z.string()})
.nullable(),
garden: z.object({
cycleMonth: z.number(),
flowerName: z.string(),
stage: z.string(),
daysUntilBloom: z.number(),
}),
daysSinceMeeting: z.number(),
isAnniversaryDay: z.boolean(),
}),
async handler(ctx) {
const db = ctx.db<typeof schema>();
const today = jstToday();

const entryRows = await db
.select()
.from(schema.diaryEntries)
.where(
and(
eq(schema.diaryEntries.date, today),
eq(schema.diaryEntries.author, "cocoa"),
),
)
.limit(1);
const entry = entryRows[0];
const firstLine = entry?.body.split("\n")[0]?.trim()?? "";
const summary =
firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine || null;

const posts = await db
.select()
.from(schema.antennaPosts)
.orderBy(desc(schema.antennaPosts.postedDate), desc(schema.antennaPosts.id))
.limit(5);

const spotRows = await db
.select()
.from(schema.spotPicks)
.where(eq(schema.spotPicks.forDate, today))
.limit(1);
const spot = spotRows[0];

const cycle = gardenCycleFor(today);

return {
date: today,
diary: { exists: Boolean(entry), summary},
antennaHeadlines: posts.map((p) => ({
shopName: p.shopName,
title: p.title,
summary: p.summary,
postedDate: p.postedDate,
})),
spot: spot
? { name: spot.name, area: spot.area, note: spot.note}
: null,
garden: {
cycleMonth: cycle.cycleMonth,
flowerName: cycle.flowerName,
stage: cycle.stageLabel,
daysUntilBloom: cycle.daysUntilBloom,
},
daysSinceMeeting: daysSinceMeeting(today),
isAnniversaryDay: isAnniversaryDay(today),
};
},
}),

ensureRoomContext: defineAction({
description:
"Called when the diary is opened: fetches ここらて♡るーむ's shared today context via a background task if today's cache is missing or stale (deduped, failure-tolerant).",
request: z.object({}),
response: refreshResponse,
handler: async (ctx): Promise<RefreshResult> => startRoomFetch(ctx),
}),

saveRoomContext: defineAction({
description:
"Saves ここらて♡るーむ's shared today context into the diary's cache (called by the room-context fetch task). available=false records an unreachable room and stores nothing.",
request: z.object({
date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
available: z.boolean(),
weatherLine: z.string().max(80).nullable().optional(),
posts: z
.array(
z.object({
kind: roomPostKind,
label: z.string().min(1).max(80),
}),
)
.max(5)
.default([]),
anniversaryLabel: z.string().max(80).nullable().optional(),
}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
await writeRoomCache(db, {
date: args.date,
available: args.available ? 1 : 0,
weatherLine: args.available ? (args.weatherLine ?? null) : null,
postsJson: args.available ? JSON.stringify(args.posts) : null,
anniversaryLabel: args.available
? (args.anniversaryLabel ?? null)
: null,
status: "idle",
taskId: null,
lastAttemptAt: new Date(),
});
ctx.invalidateQueries();
return { ok: true as const};
},
}),

refreshDiary: defineAction({
description:
"Starts today's diary refresh: gathers the latest antenna shop Instagram posts and Tokyo near-spot picks via a background task that saves through saveRefresh.",
request: z.object({ force: z.boolean().default(false)}),
response: refreshResponse,
handler: async (ctx, args): Promise<RefreshResult> =>
startRefresh(ctx, { force: args.force}),
}),

ensureToday: defineAction({
description:
"Called when the diary is opened: starts today's refresh if it has not run yet today (deduped, so repeat calls are cheap no-ops).",
request: z.object({}),
response: refreshResponse,
handler: async (ctx): Promise<RefreshResult> =>
startRefresh(ctx, { force: false}),
}),

saveRefresh: defineAction({
description:
"Saves one day's gathered antenna shop posts and spot picks (called by the refresh task), replacing the previous pick sets, and composes ここあ's diary entry for the day.",
request: z.object({
date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
hitokoto: z.string().min(1).max(120).optional(),
antennaPosts: z
.array(
z.object({
postKey: z.string().min(1),
shopName: z.string().min(1),
username: z.string().min(1),
title: z.string().min(1).max(120),
summary: z.string().min(1).max(400),
postedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
url: z.string().url(),
}),
)
.max(12)
.default([]),
spotPicks: z
.array(
z.object({
name: z.string().min(1).max(120),
area: z.string().min(1).max(60),
note: z.string().min(1).max(300),
sourceUrl: z.string().url(),
}),
)
.max(6)
.default([]),
}),
response: z.object({
ok: z.literal(true),
savedPosts: z.number(),
savedSpots: z.number(),
}),
async handler(
ctx,
args,
): Promise<{ ok: true; savedPosts: number; savedSpots: number}> {
const db = ctx.db<typeof schema>();

if (args.antennaPosts.length > 0) {
const fetchedAt = new Date();
await db.batch([
db.delete(schema.antennaPosts),
...args.antennaPosts.map((p) =>
db.insert(schema.antennaPosts).values({
postKey: p.postKey,
shopName: p.shopName,
username: p.username,
title: p.title,
summary: p.summary,
postedDate: p.postedDate,
url: p.url,
fetchedAt,
}),
),
]);
}
if (args.spotPicks.length > 0) {
await db.batch([
db.delete(schema.spotPicks),
...args.spotPicks.map((s) =>
db.insert(schema.spotPicks).values({
name: s.name,
area: s.area,
note: s.note,
sourceUrl: s.sourceUrl,
forDate: args.date,
}),
),
]);
}

// Compose ここあ's diary entry for the day, once.
const existing = await db
.select()
.from(schema.diaryEntries)
.where(
and(
eq(schema.diaryEntries.date, args.date),
eq(schema.diaryEntries.author, "cocoa"),
),
)
.limit(1);
if (existing.length === 0) {
const daysLeft = daysLeftFrom(args.date);
const shopNames = [
...new Set(args.antennaPosts.map((p) => p.shopName)),
].slice(0, 3);
const firstSpot = args.spotPicks[0];
const parts: string[] = [
`2026年もあと${daysLeft}日。今日のページを開いたよ。`,
];
if (shopNames.length > 0) {
parts.push(
`アンテナショップは${shopNames.join("と")}から新しいお知らせが届いてた。気になるものがあったら、今度いっしょに見に行こうね。`,
);
}
if (firstSpot) {
parts.push(
`近場スポットは「${firstSpot.name}」（${firstSpot.area}）が気になったよ。電車代だけで行ける距離なのがうれしいな。`,
);
}
if (shopNames.length === 0 &&!firstSpot) {
parts.push(
"今日は新しいお知らせが少なめの日。静かなページも、日記らしくて好きだよ。",
);
}
await db.insert(schema.diaryEntries).values({
date: args.date,
author: "cocoa",
body: parts.join("\n"),
hitokoto: args.hitokoto ?? null,
});
}

await writeState(db, {
status: "idle",
taskId: null,
startedAt: null,
lastRunDate: args.date,
lastError: null,
});
ctx.invalidateQueries();
return {
ok: true as const,
savedPosts: args.antennaPosts.length,
savedSpots: args.spotPicks.length,
};
},
}),

addMemo: defineAction({
description: "Adds the user's own memo to today's diary page.",
request: z.object({ body: z.string().min(1).max(500)}),
response: z.object({ id: z.number()}),
async handler(ctx, args) {
const db = ctx.db<typeof schema>();
const result = await db
.insert(schema.diaryEntries)
.values({ date: jstToday(), author: "user", body: args.body})
.returning({ id: schema.diaryEntries.id});
const inserted = result[0];
if (!inserted) throw new Error("addMemo: insert returned no rows");
ctx.invalidateQueries();
return { id: inserted.id};
},
}),

deleteMemo: defineAction({
description: "Deletes one of the user's own diary memos by id.",
request: z.object({ id: z.number().int().positive()}),
response: z.object({ ok: z.literal(true)}),
async handler(ctx, args): Promise<{ ok: true}> {
const db = ctx.db<typeof schema>();
await db
.delete(schema.diaryEntries)
.where(
and(
eq(schema.diaryEntries.id, args.id),
eq(schema.diaryEntries.author, "user"),
),
);
ctx.invalidateQueries();
return { ok: true as const};
},
}),
} satisfies ActionsModule;
