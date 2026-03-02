import { getRequestId } from "./requestContext.js";

function baseEntry(level, message, meta) {
  const requestId = getRequestId();
  return {
    ts: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...meta,
  };
}

export const logger = {
  info(message, meta = {}) {
    console.log(JSON.stringify(baseEntry("info", message, meta)));
  },
  error(message, meta = {}) {
    console.error(JSON.stringify(baseEntry("error", message, meta)));
  },
};
