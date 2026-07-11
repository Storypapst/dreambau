CREATE TABLE account_metadata (email TEXT PRIMARY KEY, shipped_version TEXT NOT NULL DEFAULT '', lifecycle_status TEXT NOT NULL DEFAULT 'active', roles TEXT NOT NULL DEFAULT '[]', topics TEXT NOT NULL DEFAULT '[]', conversation_types TEXT NOT NULL DEFAULT '[]', fixture_quality TEXT NOT NULL DEFAULT 'empty', sample_file_count INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE taxonomy_values (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, value TEXT NOT NULL);
CREATE UNIQUE INDEX taxonomy_kind_value ON taxonomy_values(kind, value);
