import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { getApiEnv } from "@ticketsprint/config/env";
const env = getApiEnv();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
try {
  await prisma.$connect();
  console.log("Database ready; no scenario seed data in Phase 1.");
} finally {
  await prisma.$disconnect();
}
