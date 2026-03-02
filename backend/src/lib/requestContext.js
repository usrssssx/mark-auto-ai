import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const requestContextStorage = new AsyncLocalStorage();

export function runWithRequestContext(context, callback) {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext() {
  return requestContextStorage.getStore() ?? null;
}

export function getRequestId() {
  return getRequestContext()?.requestId ?? null;
}

export function ensureRequestId(candidate) {
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  if (trimmed) return trimmed;
  return crypto.randomUUID();
}

