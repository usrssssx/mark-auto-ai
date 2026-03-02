import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
if (Number.isNaN(port) || port <= 0) {
  throw new Error("PORT must be a positive number");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/ai_automation",
};

