import express from "express";
import { leadWebhookRouter } from "./routes/leadWebhookRoutes.js";
import { logger } from "./lib/logger.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    return res.status(200).json({ status: "ok" });
  });

  app.use("/webhooks", leadWebhookRouter);

  app.use((error, _req, res, _next) => {
    logger.error("unhandled_error", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ error: "internal_error" });
  });

  return app;
}

