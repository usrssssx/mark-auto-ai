import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "../../db/migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations() {
  const { rows } = await pool.query(`SELECT filename FROM schema_migrations;`);
  return new Set(rows.map((row) => row.filename));
}

async function applyMigration(filename) {
  const fullPath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(fullPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      [filename],
    );
    await client.query("COMMIT");
    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureMigrationsTable();

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await getAppliedMigrations();
  for (const filename of files) {
    if (!applied.has(filename)) {
      await applyMigration(filename);
    }
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await pool.end();
  process.exit(1);
});

