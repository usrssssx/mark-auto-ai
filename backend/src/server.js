import express from "express";
import { requestContextMiddleware } from "./middlewares/requestContextMiddleware.js";
import { leadWebhookRouter } from "./routes/leadWebhookRoutes.js";
import { conversationRouter } from "./routes/conversationRoutes.js";
import { monitoringRouter } from "./routes/monitoringRoutes.js";
import { logger } from "./lib/logger.js";

export function createApp() {
  const app = express();

  app.use(requestContextMiddleware);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    return res.status(200).json({ status: "ok" });
  });

  app.use("/webhooks", leadWebhookRouter);
  app.use("/conversation", conversationRouter);
  app.use("/monitoring", monitoringRouter);

  app.use((error, req, res, _next) => {
    logger.error("unhandled_error", {
      error: error.message,
      stack: error.stack,
      method: req.method,
      path: req.originalUrl,
    });
    return res.status(500).json({
      error: "internal_error",
      requestId: req.requestId ?? null,
    });
  });

  return app;
}
