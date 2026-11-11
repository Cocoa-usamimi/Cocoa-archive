CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  slot_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX posts_kind_slot_date ON posts (kind, slot_date);
