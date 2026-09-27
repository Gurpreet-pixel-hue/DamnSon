// lib/server/db/client.ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

declare global {
  // One client per server process; survives Next.js dev hot reloads.
  var __civicweavePrisma: PrismaClient | undefined;
}

/** Lazily created so DATA_SOURCE=files never needs DATABASE_URL. */
export function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = globalThis.__civicweavePrisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalThis.__civicweavePrisma = client;
  return client;
}
