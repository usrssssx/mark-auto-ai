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
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN ?? "",
  hubspotBaseUrl: process.env.HUBSPOT_BASE_URL ?? "https://api.hubapi.com",
  hubspotDefaultDealStage: process.env.HUBSPOT_DEFAULT_DEAL_STAGE ?? "",
  hubspotDefaultPipeline: process.env.HUBSPOT_DEFAULT_PIPELINE ?? "",
  hubspotDealNamePrefix: process.env.HUBSPOT_DEAL_NAME_PREFIX ?? "AI Lead",
};
