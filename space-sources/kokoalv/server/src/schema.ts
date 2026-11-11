// Drizzle schema for ここあ旅.
//
// trips: one row per scouting trip ここあ made (a diary entry).
// spots: the ordered course of a trip — start, 2–4 stops, goal. Every spot
// is a real place resolved through the places graph (name/address/coords
// kept together from one record) or, when the graph has no record for a
// named place (e.g. a street), a name/address-only row with null coords.
// wantToGo is らて's 「いっしょに行きたい」 mark; marked spots form the
// guide list (案内リスト).

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** Coarse area key the trip was planned for, e.g. "丸の内". */
  area: text("area").notNull(),
  /** Display label, e.g. "東京・丸の内". */
  areaLabel: text("area_label").notNull(),
  /** Trip day as a YYYY-MM-DD Asia/Tokyo calendar date. */
  tripDate: text("trip_date").notNull(),
  kind: text("kind", { enum: ["walk", "scout", "antenna"] })
    .notNull()
    .default("walk"),
  /** Weather snapshot taken when the trip was made, e.g. "曇り 11℃". */
  weather: text("weather"),
  mood: text("mood"),
  /** ここあ's diary text for the trip. Empty while a plan is being made. */
  diary: text("diary").notNull().default(""),
  photoBlobKey: text("photo_blob_key"),
  photoCaption: text("photo_caption"),
  status: text("status", { enum: ["draft", "ready", "failed"] })
    .notNull()
    .default("ready"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const spots = sqliteTable("spots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id")
    .notNull()
    .references(() => trips.id),
  sortOrder: integer("sort_order").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  /** ここあ's one-line memo for this spot. */
  memo: text("memo").notNull(),
  /** The one thing to show らて when guiding here. */
  highlight: text("highlight"),
  /** Practical notes for the real visit (closures, crowds, breaks). */
  tips: text("tips"),
  hoursNote: text("hours_note"),
  rating: real("rating"),
  ratingCount: integer("rating_count"),
  sourceUrl: text("source_url"),
  wantToGo: integer("want_to_go", { mode: "boolean" })
    .notNull()
    .default(false),
  wantMarkedAt: integer("want_marked_at", { mode: "timestamp_ms" }),
  /** らて's own note for the guided visit. */
  guideMemo: text("guide_memo"),
  /** Per-spot illustration of ここあ at this place (バーチャル下見）. */
  illustrationBlobKey: text("illustration_blob_key"),
  /** When this spot was posted to Instagram as ここあのおすすめスポット. */
  igPostedAt: integer("ig_posted_at", { mode: "timestamp_ms" }),
  /** Public URL of that Instagram post, when the poster task reported one. */
  igPostUrl: text("ig_post_url"),
});
