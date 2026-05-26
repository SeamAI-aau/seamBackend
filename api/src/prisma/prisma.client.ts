import PrismaClientPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createPgPoolConfig } from './pg-pool.config';

const { PrismaClient } = PrismaClientPkg;

const pool = new Pool(createPgPoolConfig());

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
});
