import { PrismaClient } from "@prisma/client";

// A single shared Prisma client per process. In serverless environments
// you'd cache this on `globalThis` to survive hot reloads — not needed
// for a long-running Express process like this one.
export const prisma = new PrismaClient();
