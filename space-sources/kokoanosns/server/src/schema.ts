import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userMessages = sqliteTable("user_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["weather", "trend", "spot", "anniv"] }).notNull(),
  text: text("text").notNull(),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
  // その投稿の主役（商品名・イベント名・場所名など）。話題の重複防止に使う。
  // 既存行は null のままで、その場合は text / source_title から照合する。
  topic: text("topic"),
  slotDate: text("slot_date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const cocoaReplies = sqliteTable("cocoa_replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  replyToId: integer("reply_to_id"),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userPosts = sqliteTable("user_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
