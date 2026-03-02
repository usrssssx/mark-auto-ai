import { ensureRequestId, runWithRequestContext } from "../lib/requestContext.js";
import { logger } from "../lib/logger.js";

export function requestContextMiddleware(req, res, next) {
  const requestId = ensureRequestId(req.headers["x-request-id"]);
  const startedAt = Date.now();

  runWithRequestContext({ requestId }, () => {
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    logger.info("request_started", {
      method: req.method,
      path: req.originalUrl,
    });

    res.on("finish", () => {
      logger.info("request_completed", {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  });
}

