import PrismaClientPkg from '@prisma/client';

const { PrismaClient } = PrismaClientPkg;

export const prisma = new PrismaClient({
	datasourceUrl: process.env.DATABASE_URL,
});
