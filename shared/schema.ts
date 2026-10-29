import { pgTable, serial, text, jsonb, timestamp, integer, unique } from 'drizzle-orm/pg-core';

// Table for storing forged Qbits
export const forgedQbits = pgTable('forged_qbits', {
  id: serial('id').primaryKey(),
  architect_id: text('architect_id').notNull(), // UUID identifying the player's browser
  name: text('name').notNull(),
  alias: text('alias'), // Player's Resonance Alias (optional display name)
  role: text('role').notNull(),
  mission_id: text('mission_id').notNull(), // Stable mission identifier (harmonic_tuning, entanglement, etc.)
  look: jsonb('look').notNull(), // Store the design parameters as JSON
  parts: jsonb('parts').notNull(), // Array of part names
  fixes: jsonb('fixes').notNull(), // Array of fix codes
  boost: text('boost').notNull(),
  emblem: jsonb('emblem').notNull(), // Emblem configuration
  story: text('story').notNull(),
  recipe: jsonb('recipe'), // Full recipe object for canvas rendering
  image: text('image'), // Base64 PNG snapshot from canvas (optional)
  timestamp: integer('timestamp').notNull(), // Unix timestamp
  createdAt: timestamp('created_at').defaultNow(),
  // Multiplayer fields
  visibility: text('visibility').default('public'), // 'public' | 'private'
  viewCount: integer('view_count').default(0) // For trending/popularity sorting
}, (table) => ({
  // One Qbit per player per mission - enables upsert logic
  architectMissionUnique: unique().on(table.architect_id, table.mission_id)
}));

export type ForgedQbit = typeof forgedQbits.$inferSelect;
export type InsertForgedQbit = typeof forgedQbits.$inferInsert;
