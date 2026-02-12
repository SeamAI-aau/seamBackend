import "dotenv/config";
import { defineConfig } from "prisma/config";
import PrismaClientPkg from "@prisma/client";

const { PrismaClient } = PrismaClientPkg;


export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    path: "src/prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  }
});

export const prisma = new PrismaClient();
