import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
if (Number.isNaN(port) || port <= 0) {
  throw new Error("PORT must be a positive number");
}

const bookingMinScore = Number.parseInt(process.env.BOOKING_MIN_SCORE ?? "45", 10);
if (Number.isNaN(bookingMinScore) || bookingMinScore < 0) {
  throw new Error("BOOKING_MIN_SCORE must be a non-negative number");
}

const httpTimeoutMs = Number.parseInt(process.env.HTTP_TIMEOUT_MS ?? "10000", 10);
if (Number.isNaN(httpTimeoutMs) || httpTimeoutMs < 1000) {
  throw new Error("HTTP_TIMEOUT_MS must be at least 1000");
}

const httpRetryMaxAttempts = Number.parseInt(
  process.env.HTTP_RETRY_MAX_ATTEMPTS ?? "3",
  10,
);
if (Number.isNaN(httpRetryMaxAttempts) || httpRetryMaxAttempts < 1) {
  throw new Error("HTTP_RETRY_MAX_ATTEMPTS must be >= 1");
}

const httpRetryBaseDelayMs = Number.parseInt(
  process.env.HTTP_RETRY_BASE_DELAY_MS ?? "300",
  10,
);
if (Number.isNaN(httpRetryBaseDelayMs) || httpRetryBaseDelayMs < 50) {
  throw new Error("HTTP_RETRY_BASE_DELAY_MS must be at least 50");
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/ai_automation",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN ?? "",
  hubspotBaseUrl: process.env.HUBSPOT_BASE_URL ?? "https://api.hubapi.com",
  hubspotDefaultDealStage: process.env.HUBSPOT_DEFAULT_DEAL_STAGE ?? "",
  hubspotDefaultPipeline: process.env.HUBSPOT_DEFAULT_PIPELINE ?? "",
  hubspotDealNamePrefix: process.env.HUBSPOT_DEAL_NAME_PREFIX ?? "AI Lead",
  bookingProvider: process.env.BOOKING_PROVIDER ?? "calendly",
  bookingCalendlyUrl: process.env.BOOKING_CALENDLY_URL ?? "",
  bookingMinScore,
  httpTimeoutMs,
  httpRetryMaxAttempts,
  httpRetryBaseDelayMs,
};
