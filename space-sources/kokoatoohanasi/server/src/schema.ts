import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "cocoa"] }).notNull(),
  text: text("text").notNull(),
  expression: text("expression", { enum: ["neutral", "smile", "sleepy"] }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
