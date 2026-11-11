DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  area_label TEXT NOT NULL,
  trip_date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'walk',
  weather TEXT,
  mood TEXT,
  diary TEXT NOT NULL DEFAULT '',
  photo_blob_key TEXT,
  photo_caption TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  sort_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  memo TEXT NOT NULL,
  highlight TEXT,
  tips TEXT,
  hours_note TEXT,
  rating REAL,
  rating_count INTEGER,
  source_url TEXT,
  want_to_go INTEGER NOT NULL DEFAULT 0,
  want_marked_at INTEGER,
  guide_memo TEXT
);
