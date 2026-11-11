DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  expression TEXT,
  created_at INTEGER NOT NULL
);
