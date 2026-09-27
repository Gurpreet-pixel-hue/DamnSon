// prisma.config.ts (repository root)
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.local", ".env"], quiet: true });

// The seed script imports lib/server/contentHash.ts, which starts with `import "server-only"`
// (§13.2). Outside Next's react-server condition that package throws, hence --conditions.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx --conditions=react-server scripts/seed.ts" },
  // CLI only (migrate / seed). Runtime queries use DATABASE_URL through @prisma/adapter-pg.
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
