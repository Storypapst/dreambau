CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    token_hash BLOB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    progress TEXT NOT NULL DEFAULT '{}'
);
