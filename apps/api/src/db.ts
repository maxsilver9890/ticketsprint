import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { getApiEnv } from "@ticketsprint/config/env";
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getApiEnv().DATABASE_URL }),
});
