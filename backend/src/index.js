import { createApp } from "./server.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { logger } from "./lib/logger.js";

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info("server_started", {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
});

async function shutdown(signal) {
  logger.info("shutdown_started", { signal });
  server.close(async () => {
    await pool.end();
    logger.info("shutdown_complete");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

