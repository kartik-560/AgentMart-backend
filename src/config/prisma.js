import { PrismaClient } from '@prisma/client';

/**
 * Global singleton pattern for Prisma Client in serverless & development environments.
 * Prevents exhausting database connection limits across cold starts and module re-evaluations.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function getPrismaClient() {
  return prisma;
}
