DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE diary_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE antenna_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_key TEXT NOT NULL UNIQUE,
  shop_name TEXT NOT NULL,
  username TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  posted_date TEXT NOT NULL,
  url TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE spot_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  note TEXT NOT NULL,
  source_url TEXT NOT NULL,
  for_date TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE refresh_state (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  task_id TEXT,
  started_at INTEGER,
  last_run_date TEXT,
  last_error TEXT
);
