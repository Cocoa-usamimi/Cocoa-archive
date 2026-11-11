// Drizzle schema for ここあダイアリー.
//
// Tables:
//   diary_entries  — ここあ's daily diary entry (one per JST date) plus the
//                    user's own memos (author = "user").
//   antenna_posts  — latest Instagram posts from the five followed antenna
//                    shops, refreshed daily (replaced wholesale each refresh).
//   spot_picks     — today's near-spot / event picks, refreshed daily
//                    (replaced wholesale each refresh).
//   refresh_state  — singleton bookkeeping for the refresh pipeline.
//   room_context_cache — singleton cache of ここらて♡るーむ's shared
//                    "today context", fetched across spaces by a task.

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const diaryEntries = sqliteTable("diary_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // JST calendar date the entry belongs to, "YYYY-MM-DD".
  date: text("date").notNull(),
  author: text("author", { enum: ["cocoa", "user"] }).notNull(),
  body: text("body").notNull(),
  // ここあ's one-line "今日の一言" shown in the countdown hero (cocoa rows only).
  hitokoto: text("hitokoto"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const antennaPosts = sqliteTable("antenna_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Instagram post id — dedupe key across refreshes.
  postKey: text("post_key").notNull().unique(),
  shopName: text("shop_name").notNull(),
  username: text("username").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  // JST date string "YYYY-MM-DD" the post was published.
  postedDate: text("posted_date").notNull(),
  url: text("url").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const spotPicks = sqliteTable("spot_picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  area: text("area").notNull(),
  note: text("note").notNull(),
  sourceUrl: text("source_url").notNull(),
  // JST date the pick set was gathered for, "YYYY-MM-DD".
  forDate: text("for_date").notNull(),
});

// Singleton cache of ここらて♡るーむ's shared "today context" (weather
// one-liner + today's post topics + anniversary info), fetched across
// spaces by a background task. The diary renders from this cache only;
// when it is missing or stale the るーむ digest simply hides.
export const roomContextCache = sqliteTable("room_context_cache", {
  id: integer("id").primaryKey(),
  // JST date string the cached context describes, "YYYY-MM-DD".
  date: text("date"),
  // Whether the room's context was actually read on the last attempt.
  available: integer("available").notNull().default(0),
  weatherLine: text("weather_line"),
  // JSON array of { kind, label } — today's room post topics.
  postsJson: text("posts_json"),
  anniversaryLabel: text("anniversary_label"),
  status: text("status").notNull().default("idle"),
  taskId: text("task_id"),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
});

export const refreshState = sqliteTable("refresh_state", {
  id: integer("id").primaryKey(),
  status: text("status").notNull().default("idle"),
  taskId: text("task_id"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  lastRunDate: text("last_run_date"),
  lastError: text("last_error"),
});
