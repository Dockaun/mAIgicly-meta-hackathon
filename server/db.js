// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
const { neon } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-http');
const { pgTable, serial, text, jsonb, timestamp, bigint, integer } = require('drizzle-orm/pg-core');

// Define the schema directly in JavaScript
const forgedQbits = pgTable('forged_qbits', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  alias: text('alias'), // Player's Resonance Alias (optional)
  role: text('role').notNull(),
  mission_id: text('mission_id').notNull(), // Stable mission identifier
  look: jsonb('look').notNull(),
  parts: jsonb('parts').notNull(),
  fixes: jsonb('fixes').notNull(),
  boost: text('boost').notNull(),
  emblem: jsonb('emblem').notNull(),
  story: text('story').notNull(),
  image: text('image'), // Base64 PNG snapshot from canvas (optional)
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  // Multiplayer gallery fields
  visibility: text('visibility').default('public'), // 'public' | 'private'
  viewCount: integer('view_count').default(0) // For trending/popularity sorting
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema: { forgedQbits } });

module.exports = { db, forgedQbits };