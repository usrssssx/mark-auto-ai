import { config } from "../config.js";
import { logger } from "./logger.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelayMs(attempt) {
  const base = config.httpRetryBaseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * Math.max(20, config.httpRetryBaseDelayMs));
  return base + jitter;
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function isRetryableNetworkError(error) {
  const code = error?.cause?.code ?? error?.code;
  if (!code) return false;

  return [
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EAI_AGAIN",
  ].includes(code);
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function requestJson(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = config.httpTimeoutMs,
    maxAttempts = config.httpRetryMaxAttempts,
    retryLabel = "http_request",
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const parsedBody = await parseResponseBody(response);
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          body: parsedBody,
        };
      }

      const retryable = isRetryableStatus(response.status) && attempt < maxAttempts;
      if (retryable) {
        const delayMs = computeBackoffDelayMs(attempt);
        logger.info("http_retry_scheduled", {
          retryLabel,
          attempt,
          status: response.status,
          delayMs,
        });
        await delay(delayMs);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        body: parsedBody,
      };
    } catch (error) {
      clearTimeout(timer);

      const retryable =
        (isAbortError(error) || isRetryableNetworkError(error)) && attempt < maxAttempts;

      if (retryable) {
        const delayMs = computeBackoffDelayMs(attempt);
        logger.info("http_retry_scheduled", {
          retryLabel,
          attempt,
          networkError: error.message,
          delayMs,
        });
        await delay(delayMs);
        continue;
      }

      throw error;
    }
  }

  return {
    ok: false,
    status: 599,
    body: {
      error: "max_attempts_exceeded",
    },
  };
}

