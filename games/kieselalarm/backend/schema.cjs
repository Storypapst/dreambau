const { blob, integer, sqliteTable, text } = require('drizzle-orm/sqlite-core');

exports.profiles = sqliteTable('profiles', {
  id: text('id').primaryKey().notNull(),
  tokenHash: blob('token_hash').notNull(),
  revision: integer('revision').notNull().default(0),
  progress: text('progress').notNull().default('{}'),
});
