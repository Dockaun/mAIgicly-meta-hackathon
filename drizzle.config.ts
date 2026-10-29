import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});