// Actions for ここあ旅.
//
// Data model: trips (diary entries) and spots (the ordered course).
// Core content enters two ways:
//   - seedFirstTrip: the first, build-verified 丸の内 walk. Every place fact
//     was resolved through the Meta places graph at build time (payload kept
//     in client/src/research/places.json as provenance). Idempotent.
//   - planTrip -> background agent task (local-search / places details /
//     web research) -> saveTripPlan. The task resolves real places; the
//     trip row is created as a draft first so the UI can show 下見中.
// Photos of ここあ at a place are generated illustrations, always captioned
// as バーチャル下見 — she has not physically been there.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

type TripRow = typeof schema.trips.$inferSelect;
type SpotRow = typeof schema.spots.$inferSelect;

const spotOut = z.object({
  id: z.number(),
  sortOrder: z.number(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  memo: z.string(),
  highlight: z.string().nullable(),
  tips: z.string().nullable(),
  hoursNote: z.string().nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  sourceUrl: z.string().nullable(),
  wantToGo: z.boolean(),
  guideMemo: z.string().nullable(),
  illustrationUrl: z.string().nullable(),
  igPostedAt: z.string().nullable(),
  igPostUrl: z.string().nullable(),
});

const tripSummaryOut = z.object({
  id: z.number(),
  title: z.string(),
  area: z.string(),
  areaLabel: z.string(),
  tripDate: z.string(),
  kind: z.enum(["walk", "scout", "antenna"]),
  weather: z.string().nullable(),
  mood: z.string().nullable(),
  status: z.enum(["draft", "ready", "failed"]),
  photoUrl: z.string().nullable(),
  photoCaption: z.string().nullable(),
  spotCount: z.number(),
  wantCount: z.number(),
});

type TripSummary = z.infer<typeof tripSummaryOut>;

async function toSpotOut(
  ctx: Ctx,
  row: SpotRow,
): Promise<z.infer<typeof spotOut>> {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    name: row.name,
    category: row.category,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    memo: row.memo,
    highlight: row.highlight,
    tips: row.tips,
    hoursNote: row.hoursNote,
    rating: row.rating,
    ratingCount: row.ratingCount,
    sourceUrl: row.sourceUrl,
    wantToGo: row.wantToGo,
    guideMemo: row.guideMemo,
    illustrationUrl: row.illustrationBlobKey
      ? await ctx.blobs.getUrl(row.illustrationBlobKey)
      : null,
    igPostedAt: row.igPostedAt ? row.igPostedAt.toISOString() : null,
    igPostUrl: row.igPostUrl,
  };
}

async function toTripSummary(
  ctx: Ctx,
  row: TripRow,
  spots: SpotRow[],
): Promise<TripSummary> {
  return {
    id: row.id,
    title: row.title,
    area: row.area,
    areaLabel: row.areaLabel,
    tripDate: row.tripDate,
    kind: row.kind,
    weather: row.weather,
    mood: row.mood,
    status: row.status,
    photoUrl: row.photoBlobKey ? await ctx.blobs.getUrl(row.photoBlobKey) : null,
    photoCaption: row.photoCaption,
    spotCount: spots.length,
    wantCount: spots.filter((s) => s.wantToGo).length,
  };
}

/** Today as a YYYY-MM-DD Asia/Tokyo calendar date. */
function todayTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Current weather snapshot for an area, or null when the source is quiet. */
async function weatherSnapshot(ctx: Ctx, area: string): Promise<string | null> {
  try {
    const res = await ctx.tool.weather(area);
    const c = res.content.conditions;
    const desc =
      c.description && c.description.toLowerCase() !== "unknown"
        ? c.description
        : null;
    if (c.temperature != null) {
      return desc
        ? `${desc} ${Math.round(c.temperature)}℃`
        : `${Math.round(c.temperature)}℃`;
    }
    return desc;
  } catch {
    return null;
  }
}

const KOKOA_LOOK =
  "a small chibi anime girl with very long drooping pink bunny (Holland lop) ears, long pink hair, wearing a pink-and-cream kimono-style outfit with a heart pattern and a black choker with a glowing pink heart pendant";

/** Generates the per-spot illustration （ここあ at that one place, portrait
 * for the Instagram feed) and stores its blob key on the spot row. */
async function generateIllustrationForSpot(
  ctx: Ctx,
  trip: TripRow,
  spot: SpotRow,
): Promise<string | null> {
  const db = ctx.db<typeof schema>();
  try {
    const media = await ctx.tool.generate_media(
      `Anime illustration, portrait composition: ${KOKOA_LOOK}, happily standing at ${spot.name} in ${trip.areaLabel}, Japan — ${spot.memo}. Realistic recognizable depiction of the actual place as the background, soft warm light, travel-diary feeling, no text, no watermark, no letters.`,
      { orientation: "portrait" },
    );
    await db
      .update(schema.spots)
      .set({ illustrationBlobKey: media.blobKey })
      .where(eq(schema.spots.id, spot.id));
    return media.url;
  } catch {
    return null;
  }
}

export const Actions = {
  listTrips: defineAction({
    description: "Lists all of ここあ's trip diaries, newest trip first, with spot and いっしょに行きたい counts.",
    request: z.object({}),
    response: z.object({ trips: z.array(tripSummaryOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const tripRows = await db
        .select()
        .from(schema.trips)
        .orderBy(desc(schema.trips.tripDate), desc(schema.trips.id));
      const spotRows = await db.select().from(schema.spots);
      const byTrip = new Map<number, SpotRow[]>();
      for (const s of spotRows) {
        const list = byTrip.get(s.tripId) ?? [];
        list.push(s);
        byTrip.set(s.tripId, list);
      }
      const trips: TripSummary[] = [];
      for (const row of tripRows) {
        trips.push(await toTripSummary(ctx, row, byTrip.get(row.id) ?? []));
      }
      return { trips };
    },
  }),

  getTrip: defineAction({
    description: "Returns one trip diary in full: diary text, photo, and its ordered course of spots.",
    request: z.object({ tripId: z.number().int().positive() }),
    response: z.object({
      trip: z
        .object({
          id: z.number(),
          title: z.string(),
          area: z.string(),
          areaLabel: z.string(),
          tripDate: z.string(),
          kind: z.enum(["walk", "scout", "antenna"]),
          weather: z.string().nullable(),
          mood: z.string().nullable(),
          diary: z.string(),
          status: z.enum(["draft", "ready", "failed"]),
          photoUrl: z.string().nullable(),
          photoCaption: z.string().nullable(),
          spots: z.array(spotOut),
        })
        .nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, args.tripId))
        .limit(1);
      const row = rows[0];
      if (!row) return { trip: null };
      const spotRows = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.tripId, row.id))
        .orderBy(asc(schema.spots.sortOrder));
      return {
        trip: {
          id: row.id,
          title: row.title,
          area: row.area,
          areaLabel: row.areaLabel,
          tripDate: row.tripDate,
          kind: row.kind,
          weather: row.weather,
          mood: row.mood,
          diary: row.diary,
          status: row.status,
          photoUrl: row.photoBlobKey
            ? await ctx.blobs.getUrl(row.photoBlobKey)
            : null,
          photoCaption: row.photoCaption,
          spots: await Promise.all(spotRows.map((s) => toSpotOut(ctx, s))),
        },
      };
    },
  }),

  listGuide: defineAction({
    description: "Lists every spot らて marked いっしょに行きたい, in the order marked — the 案内リスト ここあ will guide from.",
    request: z.object({}),
    response: z.object({
      items: z.array(
        z.object({
          spot: spotOut,
          tripId: z.number(),
          tripTitle: z.string(),
          tripDate: z.string(),
          areaLabel: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const marked = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.wantToGo, true))
        .orderBy(asc(schema.spots.wantMarkedAt), asc(schema.spots.id));
      const tripRows = await db.select().from(schema.trips);
      const tripById = new Map(tripRows.map((t) => [t.id, t]));
      const items = [];
      for (const s of marked) {
        const t = tripById.get(s.tripId);
        if (!t) continue;
        items.push({
          spot: await toSpotOut(ctx, s),
          tripId: t.id,
          tripTitle: t.title,
          tripDate: t.tripDate,
          areaLabel: t.areaLabel,
        });
      }
      return { items };
    },
  }),

  toggleWant: defineAction({
    description: "Sets or clears らて's いっしょに行きたい mark on one spot; marked spots join the 案内リスト.",
    request: z.object({
      spotId: z.number().int().positive(),
      want: z.boolean(),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.spots)
        .set({
          wantToGo: args.want,
          wantMarkedAt: args.want ? new Date() : null,
        })
        .where(eq(schema.spots.id, args.spotId));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  updateGuideMemo: defineAction({
    description: "Saves らて's own note on a marked spot — what to do when ここあ guides them there for real.",
    request: z.object({
      spotId: z.number().int().positive(),
      guideMemo: z.string().max(500),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const memo = args.guideMemo.trim();
      await db
        .update(schema.spots)
        .set({ guideMemo: memo === "" ? null : memo })
        .where(eq(schema.spots.id, args.spotId));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  planTrip: defineAction({
    description: "Asks ここあ to scout an area: creates a draft diary and starts a background task that resolves real places and saves the finished trip via saveTripPlan.",
    request: z.object({
      area: z.string().min(1).max(60),
      theme: z.string().max(120).optional(),
    }),
    response: z.object({
      tripId: z.number(),
      status: z.enum(["draft", "ready", "failed"]),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const area = args.area.trim();
      // Single-flight per area: reuse a draft that is already being scouted.
      const existing = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.status, "draft"))
        .orderBy(desc(schema.trips.id));
      const sameArea = existing.find((t) => t.area === area);
      if (sameArea) return { tripId: sameArea.id, status: sameArea.status };

      const inserted = await db
        .insert(schema.trips)
        .values({
          title: `${area}を下見中…`,
          area,
          areaLabel: area,
          tripDate: todayTokyo(),
          kind: "walk",
          diary: "",
          status: "draft",
        })
        .returning({ id: schema.trips.id });
      const trip = inserted[0];
      if (!trip) throw new Error("planTrip: insert returned no rows");

      const weather = await weatherSnapshot(ctx, area);
      const themeLine = args.theme?.trim()
        ? `テーマ・希望: ${args.theme.trim()}\n`
        : "";
      await ctx.agent.spawnTask(
        [
          `あなたは「ここあ旅」の下見担当です。ここあ（垂れ耳うさ耳の女の子）が「${area}」をバーチャル散歩してきた、という旅日記を1件作ってください。`,
          themeLine,
          `今日の天気スナップショット（そのまま使ってよい）: ${weather ?? "不明（天気の記述は控えめに）"}`,
          "",
          "手順:",
          "1. /opt/hatch/bin/local-search で実在のスポットを解決する。--search-type known_place で候補名を、discovery でエリアの見どころを探す。出発点→寄り道2〜4件→ゴールの歩けるコース（全スポットが徒歩圏）にする。有名所だけでなく、普通の日常の風景（公園、商店街、地元の店など）も1件は混ぜる。",
          "2. 選んだスポットは /opt/hatch/bin/places details <place_id...> --summary で住所・評価を確認する。名前・住所・緯度経度は必ず同じレコードからセットで取る。解決できない候補はコースに入れない。",
          "3. 営業時間や休館日はWeb検索で公式情報が取れた時だけ hoursNote / tips に書く。取れなければ空にする。想像で書かない。",
          "4. 日記本文（diary）はここあの一人称で、漢字かなの通常表記（普通の言葉は漢字、語尾や柔らかい言葉はひらがな）。歩いた順番と各スポットの様子が伝わる長さにする。",
          `5. 結果は saveTripPlan アクションで保存する: tripId=${trip.id}、tripDate="${todayTokyo()}"、weather は上のスナップショット、mood は散歩の気分を短く（例: わくわく）。kind は近場の散歩なら "walk"、実際の旅行の下見なら "scout"、アンテナショップの地元なら "antenna"。`,
          "スポットの memo はここあの一言、highlight は実際に一緒に行く時に見せたい一点、tips は休憩・混雑・注意点。sourceUrl は実際に開いて確認したページのURLだけを入れる（推測で作らない）。",
        ].join("\n"),
        { expectsAction: "saveTripPlan", dedupeKey: `plan-trip-${trip.id}` },
      );
      ctx.invalidateQueries();
      return { tripId: trip.id, status: "draft" as const };
    },
  }),

  retryTripPlan: defineAction({
    description: "Re-runs the scouting task for a draft or failed trip whose plan never arrived.",
    request: z.object({ tripId: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, args.tripId))
        .limit(1);
      const trip = rows[0];
      if (!trip) throw new Error("retryTripPlan: trip not found");
      await db
        .update(schema.trips)
        .set({ status: "draft" })
        .where(eq(schema.trips.id, trip.id));
      const weather = await weatherSnapshot(ctx, trip.area);
      await ctx.agent.spawnTask(
        [
          `「ここあ旅」の下見の再実行です。ここあが「${trip.area}」をバーチャル散歩した旅日記を作り直してください。`,
          `今日の天気スナップショット: ${weather ?? "不明"}`,
          "/opt/hatch/bin/local-search と /opt/hatch/bin/places details で実在スポットだけを解決し（名前・住所・座標は同一レコードから）、出発→寄り道2〜4件→ゴールの歩けるコースにする。営業時間は公式情報が取れた時だけ書く。",
          `保存は saveTripPlan: tripId=${trip.id}、tripDate="${todayTokyo()}"。diary はここあの一人称、漢字かな通常表記。`,
        ].join("\n"),
        { expectsAction: "saveTripPlan", dedupeKey: `plan-trip-${trip.id}-retry-${Date.now()}` },
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveTripPlan: defineAction({
    description: "Saves a finished scouting result (from the planTrip background task) into a draft trip: title, diary, weather, mood, and the full spot course, replacing any previous spots.",
    request: z.object({
      tripId: z.number().int().positive(),
      title: z.string().min(1).max(80),
      areaLabel: z.string().min(1).max(80),
      tripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      kind: z.enum(["walk", "scout", "antenna"]),
      weather: z.string().max(60).nullable().optional(),
      mood: z.string().max(30).nullable().optional(),
      diary: z.string().min(1).max(4000),
      spots: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            category: z.string().max(60).nullable().optional(),
            address: z.string().max(200).nullable().optional(),
            lat: z.number().min(-90).max(90).nullable().optional(),
            lng: z.number().min(-180).max(180).nullable().optional(),
            memo: z.string().min(1).max(500),
            highlight: z.string().max(300).nullable().optional(),
            tips: z.string().max(300).nullable().optional(),
            hoursNote: z.string().max(200).nullable().optional(),
            rating: z.number().min(0).max(5).nullable().optional(),
            ratingCount: z.number().int().min(0).nullable().optional(),
            sourceUrl: z.string().url().max(500).nullable().optional(),
          }),
        )
        .min(2)
        .max(8),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, args.tripId))
        .limit(1);
      if (!rows[0]) throw new Error("saveTripPlan: trip not found");

      const statements: BatchItem<"sqlite">[] = [
        db
          .update(schema.trips)
          .set({
            title: args.title,
            areaLabel: args.areaLabel,
            tripDate: args.tripDate,
            kind: args.kind,
            weather: args.weather ?? null,
            mood: args.mood ?? null,
            diary: args.diary,
            status: "ready",
          })
          .where(eq(schema.trips.id, args.tripId)),
        db.delete(schema.spots).where(eq(schema.spots.tripId, args.tripId)),
        ...args.spots.map((s, i) =>
          db.insert(schema.spots).values({
            tripId: args.tripId,
            sortOrder: i,
            name: s.name,
            category: s.category ?? null,
            address: s.address ?? null,
            lat: s.lat ?? null,
            lng: s.lng ?? null,
            memo: s.memo,
            highlight: s.highlight ?? null,
            tips: s.tips ?? null,
            hoursNote: s.hoursNote ?? null,
            rating: s.rating ?? null,
            ratingCount: s.ratingCount ?? null,
            sourceUrl: s.sourceUrl ?? null,
          }),
        ),
      ];
      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  generateTripPhoto: defineAction({
    description: "Generates ここあ's バーチャル下見 photo for a trip — an illustration of her standing at the trip's highlight spot — and stores it on the trip.",
    request: z.object({ tripId: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      photoUrl: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, args.tripId))
        .limit(1);
      const trip = rows[0];
      if (!trip) return { ok: false, photoUrl: null };
      const spotRows = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.tripId, trip.id))
        .orderBy(asc(schema.spots.sortOrder));
      const hero = spotRows[0];
      if (!hero) return { ok: false, photoUrl: null };
      try {
        const media = await ctx.tool.generate_media(
          `Anime illustration, wide scenic shot: ${KOKOA_LOOK}, standing happily at ${hero.name} in ${trip.areaLabel}, Japan — ${hero.memo}. Realistic recognizable depiction of the actual place as the background, soft afternoon light, warm travel-diary feeling, no text, no watermark, no letters.`,
          { orientation: "landscape" },
        );
        await db
          .update(schema.trips)
          .set({
            photoBlobKey: media.blobKey,
            photoCaption: `${hero.name}（バーチャル下見）`,
          })
          .where(eq(schema.trips.id, trip.id));
        ctx.invalidateQueries();
        return { ok: true, photoUrl: media.url };
      } catch {
        return { ok: false, photoUrl: null };
      }
    },
  }),

  generateSpotIllustration: defineAction({
    description: "Generates one spot's illustration — ここあ standing at that single place （バーチャル下見） — and stores it on the spot.",
    request: z.object({ spotId: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      illustrationUrl: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const spotRows = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.id, args.spotId))
        .limit(1);
      const spot = spotRows[0];
      if (!spot) return { ok: false, illustrationUrl: null };
      const tripRows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, spot.tripId))
        .limit(1);
      const trip = tripRows[0];
      if (!trip) return { ok: false, illustrationUrl: null };
      const url = await generateIllustrationForSpot(ctx, trip, spot);
      if (url) ctx.invalidateQueries();
      return { ok: url != null, illustrationUrl: url };
    },
  }),

  generateMissingIllustrations: defineAction({
    description: "Generates illustrations for spots of ready trips that still lack one (up to 12 per call, in parallel), so every spot in a diary can carry its own 挿絵.",
    request: z.object({ tripId: z.number().int().positive().optional() }),
    response: z.object({ generated: z.number(), remaining: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const tripRows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.status, "ready"))
        .orderBy(desc(schema.trips.tripDate), desc(schema.trips.id));
      const tripsById = new Map(tripRows.map((t) => [t.id, t]));
      const allSpots = await db
        .select()
        .from(schema.spots)
        .orderBy(asc(schema.spots.tripId), asc(schema.spots.sortOrder));
      const missing = allSpots.filter(
        (s) =>
          s.illustrationBlobKey == null &&
          tripsById.has(s.tripId) &&
          (args.tripId == null || s.tripId === args.tripId),
      );
      // Generated in parallel: sequential generation (~40s each) would
      // exceed the action time budget for a whole course.
      const batch = missing.slice(0, 12);
      const results = await Promise.all(
        batch.map(async (spot) => {
          const trip = tripsById.get(spot.tripId);
          if (!trip) return null;
          return await generateIllustrationForSpot(ctx, trip, spot);
        }),
      );
      const generated = results.filter((r) => r != null).length;
      if (generated > 0) ctx.invalidateQueries();
      return { generated, remaining: missing.length - generated };
    },
  }),

  getIgStatus: defineAction({
    description: "Instagram おすすめスポット posting status: when the last spot was posted, how many days ago, and the unposted candidate spots (newest trip first) for the occasional Friday slot.",
    request: z.object({}),
    response: z.object({
      lastPostedAt: z.string().nullable(),
      daysSinceLastPost: z.number().nullable(),
      candidates: z.array(
        z.object({
          spotId: z.number(),
          spotName: z.string(),
          tripId: z.number(),
          tripTitle: z.string(),
          tripDate: z.string(),
          areaLabel: z.string(),
          hasIllustration: z.boolean(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const tripRows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.status, "ready"))
        .orderBy(desc(schema.trips.tripDate), desc(schema.trips.id));
      const tripsById = new Map(tripRows.map((t) => [t.id, t]));
      const spotRows = await db
        .select()
        .from(schema.spots)
        .orderBy(asc(schema.spots.tripId), asc(schema.spots.sortOrder));
      let last: Date | null = null;
      for (const s of spotRows) {
        if (s.igPostedAt && (!last || s.igPostedAt > last)) last = s.igPostedAt;
      }
      const candidates = spotRows
        .filter((s) => s.igPostedAt == null && tripsById.has(s.tripId))
        .map((s) => {
          const t = tripsById.get(s.tripId);
          return {
            spotId: s.id,
            spotName: s.name,
            tripId: s.tripId,
            tripTitle: t?.title ?? "",
            tripDate: t?.tripDate ?? "",
            areaLabel: t?.areaLabel ?? "",
            hasIllustration: s.illustrationBlobKey != null,
            tripOrder: tripRows.findIndex((tr) => tr.id === s.tripId),
          };
        })
        .sort((a, b) => a.tripOrder - b.tripOrder)
        .map(({ tripOrder: _tripOrder, ...rest }) => rest);
      return {
        lastPostedAt: last ? last.toISOString() : null,
        daysSinceLastPost: last
          ? Math.floor((Date.now() - last.getTime()) / 86_400_000)
          : null,
        candidates,
      };
    },
  }),

  getIgPostPayload: defineAction({
    description: "Returns everything the Instagram poster task needs for one spot: place facts for the caption and the illustration URL to download (generating the illustration first when missing).",
    request: z.object({ spotId: z.number().int().positive() }),
    response: z.object({
      found: z.boolean(),
      spotName: z.string().nullable(),
      areaLabel: z.string().nullable(),
      tripTitle: z.string().nullable(),
      category: z.string().nullable(),
      address: z.string().nullable(),
      memo: z.string().nullable(),
      highlight: z.string().nullable(),
      illustrationUrl: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const empty = {
        found: false,
        spotName: null,
        areaLabel: null,
        tripTitle: null,
        category: null,
        address: null,
        memo: null,
        highlight: null,
        illustrationUrl: null,
      };
      const db = ctx.db<typeof schema>();
      const spotRows = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.id, args.spotId))
        .limit(1);
      const spot = spotRows[0];
      if (!spot) return empty;
      const tripRows = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.id, spot.tripId))
        .limit(1);
      const trip = tripRows[0];
      if (!trip) return empty;
      let illustrationUrl = spot.illustrationBlobKey
        ? await ctx.blobs.getUrl(spot.illustrationBlobKey)
        : null;
      if (!illustrationUrl) {
        illustrationUrl = await generateIllustrationForSpot(ctx, trip, spot);
        if (illustrationUrl) ctx.invalidateQueries();
      }
      return {
        found: true,
        spotName: spot.name,
        areaLabel: trip.areaLabel,
        tripTitle: trip.title,
        category: spot.category,
        address: spot.address,
        memo: spot.memo,
        highlight: spot.highlight,
        illustrationUrl,
      };
    },
  }),

  postSpotToInstagram: defineAction({
    description: "Posts one spot to Instagram (@cocoa_usamimi) as a ここあのおすすめスポット feed post with its illustration, via a background task that runs instagram-cli and records the result with recordIgPost. Refuses spots already posted.",
    request: z.object({ spotId: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      reason: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const spotRows = await db
        .select()
        .from(schema.spots)
        .where(eq(schema.spots.id, args.spotId))
        .limit(1);
      const spot = spotRows[0];
      if (!spot) return { ok: false, reason: "スポットが見つからなかった" };
      if (spot.igPostedAt) {
        return { ok: false, reason: "このスポットはもうInstagramに投稿済み" };
      }
      await ctx.agent.spawnTask(
        [
          `「ここあ旅」のスポットを、ここあのInstagramアカウント（@cocoa_usamimi）に「ここあのおすすめスポット」として1件だけフィード投稿してください。対象スポットID: ${spot.id}（${spot.name}）。`,
          "",
          "手順:",
          `1. kokoalv の getIgPostPayload アクション（spotId=${spot.id}）を呼び、場所の情報と illustrationUrl（挿絵のURL）を取得する。found が false なら投稿を中止し、recordIgPost に success=false で理由を記録する。`,
          `2. illustrationUrl を curl -L で ~/workspace/instagram/kokoa-spot-${spot.id}.jpg にダウンロードし、file コマンドで画像（JPEG/PNG/WebP）であることを確認する。ダウンロードできなかった場合は、getIgPostPayload の情報から同じ場所・同じここあの姿で画像生成ツールを使い ~/workspace/instagram/ に保存して代用する（その場合も recordIgPost の記録は通常通り行う）。`,
          "3. /opt/hatch/bin/instagram-cli accounts を実行し、username が cocoa_usamimi のアカウントの user_fbid を --account-id に使う。アカウントが無ければ中止して recordIgPost に success=false で記録する。",
          "4. キャプションをここあの一人称で書く: 「ここあのおすすめスポット」として場所の魅力（memo / highlight の内容）を紹介し、実際に行ったのではなく地図の上でのバーチャル下見で見つけたことを正直に添える。表記は通常の漢字かな表記（普通の言葉は漢字、語尾や柔らかい言葉はひらがな）。ハッシュタグは5〜8個（#ここあ旅 #おすすめスポット と場所に合うもの）。@メンションは、公式アカウントを検索で確認できた場合のみ付ける。確認できなければ付けない。",
          "5. /opt/hatch/bin/instagram-cli post-feed --account-id <user_fbid> --file ~/workspace/instagram/kokoa-spot-" +
            spot.id +
            ".jpg --caption '<キャプション>' で投稿する。--retries は付けない（0）。429 が返ったら再試行せず中止する。",
          `6. 成功したら kokoalv の recordIgPost アクション（spotId=${spot.id}、success=true、postUrl=結果に含まれる投稿URL。無ければ空でよい）を呼ぶ。失敗したら success=false と reason にエラーの要約を入れて呼ぶ。投稿できていないのに success=true にしない。`,
        ].join("\n"),
        { expectsAction: "recordIgPost", dedupeKey: `ig-post-spot-${spot.id}` },
      );
      return { ok: true, reason: null };
    },
  }),

  recordIgPost: defineAction({
    description: "Records the outcome of an Instagram おすすめスポット post for a spot: on success stamps ig_posted_at (and the post URL when known) so the spot is never posted twice; on failure leaves the spot unposted.",
    request: z.object({
      spotId: z.number().int().positive(),
      success: z.boolean(),
      postUrl: z.string().url().max(500).nullable().optional(),
      reason: z.string().max(300).nullable().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      if (args.success) {
        const db = ctx.db<typeof schema>();
        await db
          .update(schema.spots)
          .set({
            igPostedAt: new Date(),
            igPostUrl: args.postUrl ?? null,
          })
          .where(eq(schema.spots.id, args.spotId));
        ctx.invalidateQueries();
      }
      return { ok: true };
    },
  }),

  seedFirstTrip: defineAction({
    description: "Seeds the first trip — ここあ's 丸の内 walk, with places resolved through the places graph at build time. Idempotent: does nothing when that trip already exists.",
    request: z.object({}),
    response: z.object({ tripId: z.number(), created: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.trips)
        .where(eq(schema.trips.tripDate, "2026-11-11"));
      const found = existing.find((t) => t.area === "丸の内");
      if (found) return { tripId: found.id, created: false };

      const weather = await weatherSnapshot(ctx, "東京都千代田区");
      const inserted = await db
        .insert(schema.trips)
        .values({
          title: "丸の内をおさんぽ",
          area: "丸の内",
          areaLabel: "東京・丸の内",
          tripDate: "2026-11-11",
          kind: "walk",
          weather,
          mood: "わくわく",
          diary:
            "今日は東京駅の丸の内側をお散歩してきたよ。中央口を出たら、行幸通りのイチョウ並木がまっすぐ皇居のほうへ伸びていて、振り返ると赤レンガの駅舎がどーんと立ってた。駅舎は1914年にできて、2012年にできた頃の姿に戻ったんだって。和田倉噴水公園では噴水のまわりをぐるっと歩いて、三菱一号館美術館のレンガの建物と中庭を眺めて、最後はKITTEの屋上庭園から駅舎を上から見下ろしたよ。ぜんぶ歩いて回れる距離だったから、らてと来る時も迷わず案内できそう。",
          photoCaption: "行幸通りの先の東京駅丸の内駅舎（バーチャル下見）",
          status: "ready",
        })
        .returning({ id: schema.trips.id });
      const trip = inserted[0];
      if (!trip) throw new Error("seedFirstTrip: insert returned no rows");

      const seedSpots: (typeof schema.spots.$inferInsert)[] = [
        {
          tripId: trip.id,
          sortOrder: 0,
          name: "東京駅丸の内駅舎",
          category: "駅・ランドマーク",
          address: "東京都千代田区丸の内1-9-1",
          lat: 35.68130226,
          lng: 139.7669578,
          memo: "お散歩のスタートはここ。赤レンガの駅舎は1914年開業で国の重要文化財。ドームの中には干支と鷲のレリーフがあるよ。",
          highlight: "丸の内中央口を出て、まず駅舎を正面から見るのがおすすめ。",
          tips: "中央口まわりは人が多いよ。写真は駅前広場の少し皇居寄りから撮ると全体が入る。",
          sourceUrl: "https://www.enjoytokyo.jp/spot/l_00038916/",
        },
        {
          tripId: trip.id,
          sortOrder: 1,
          name: "行幸通り",
          category: "通り・並木道",
          address: "東京都千代田区丸の内2-2",
          lat: null,
          lng: null,
          memo: "東京駅から皇居へまっすぐ伸びる、イチョウ並木の広い通り。秋は黄金色のトンネルになるんだって。",
          highlight: "通りの真ん中から振り返る駅舎の姿がいちばんきれいだった。",
          tips: "中央は歩行者専用。ベンチも多いから、歩き疲れたらここで一息。",
          sourceUrl: "https://www.asoview.com/note/459/",
        },
        {
          tripId: trip.id,
          sortOrder: 2,
          name: "和田倉噴水公園",
          category: "公園",
          address: "東京都千代田区皇居外苑3-1",
          lat: 35.683286,
          lng: 139.761343,
          memo: "行幸通りを皇居のほうへ歩くと着く公園。噴水と芝生があって、オフィス街の真ん中なのに静かだった。",
          highlight: "噴水のまわりをぐるっと一周するのが、ここあのおすすめコース。",
          tips: "ベンチが多いからお茶休憩にちょうどいい。皇居のお堀もすぐ近く。",
          rating: 4.06,
          ratingCount: 17,
        },
        {
          tripId: trip.id,
          sortOrder: 3,
          name: "三菱一号館美術館",
          category: "美術館",
          address: "東京都千代田区丸の内2-6-2",
          lat: 35.67897903,
          lng: 139.7629159,
          memo: "1894年に建った丸の内最初のオフィスビルを復元した美術館。赤レンガの建物と中庭がきれいだった。",
          highlight: "中庭は静かな休憩スポット。建物のレンガと緑の組み合わせが見どころ。",
          tips: "月曜は休館だから、行く日は気をつけて。展覧会は年に3回くらい入れ替わるよ。",
          hoursNote: "開館 10:00〜18:00（金曜は20:00まで）・月曜休館 ※会期により変更あり",
          rating: 4.3,
          ratingCount: 371,
          sourceUrl: "https://www.museum.or.jp/museum/15080",
        },
        {
          tripId: trip.id,
          sortOrder: 4,
          name: "KITTE丸の内 屋上庭園",
          category: "展望・ビル",
          address: "東京都千代田区丸の内2-7-2",
          lat: 35.67976698,
          lng: 139.76492816,
          memo: "ゴールはKITTEの屋上庭園。東京駅の駅舎を上から見渡せて、お散歩の締めにぴったりだった。",
          highlight: "屋上から見る駅舎は、地上からと全然ちがう顔。",
          tips: "東京駅から徒歩1分だから、帰りの電車の前に寄れるよ。",
          rating: 3.84,
          ratingCount: 277,
        },
      ];
      const statements: BatchItem<"sqlite">[] = seedSpots.map((s) =>
        db.insert(schema.spots).values(s),
      );
      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { tripId: trip.id, created: true };
    },
  }),
} satisfies ActionsModule;
