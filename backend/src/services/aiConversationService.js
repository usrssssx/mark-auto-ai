import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { requestJson } from "../lib/httpClient.js";

const REQUIRED_FIELDS = ["budget", "timeline", "serviceType"];

const FIELD_QUESTIONS = {
  budget: "What budget range are you planning for this project (USD)?",
  timeline: "What is your target timeline to start and launch this project?",
  serviceType:
    "Which exact service do you need first: PPC, SEO, lead generation, or something else?",
};

function parseBudgetUsd(text) {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/,/g, "");

  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k/);
  if (kMatch) {
    return Math.round(Number(kMatch[1]) * 1000);
  }

  const usdMatch = normalized.match(/\$?\s?(\d{3,6})/);
  if (usdMatch) {
    return Number(usdMatch[1]);
  }

  return null;
}

function parseTimelineDays(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();

  const dayMatch = normalized.match(/(\d+)\s*(day|days)/);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = normalized.match(/(\d+)\s*(week|weeks)/);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const monthMatch = normalized.match(/(\d+)\s*(month|months)/);
  if (monthMatch) return Number(monthMatch[1]) * 30;

  if (normalized.includes("asap")) return 7;

  return null;
}

function parseServiceType(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();

  if (normalized.includes("ppc")) return "ppc";
  if (normalized.includes("seo")) return "seo";
  if (normalized.includes("lead generation") || normalized.includes("lead gen")) {
    return "lead_generation";
  }
  if (normalized.includes("social")) return "social_media";
  if (normalized.includes("web")) return "web";

  return null;
}

function parseDecisionMaker(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (
    normalized.includes("i decide") ||
    normalized.includes("decision maker") ||
    normalized.includes("founder") ||
    normalized.includes("owner")
  ) {
    return true;
  }
  if (
    normalized.includes("need approval") ||
    normalized.includes("my manager") ||
    normalized.includes("my boss")
  ) {
    return false;
  }
  return null;
}

function extractJsonFromContent(content) {
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function findMissingFields(qualification) {
  const missing = [];
  if (qualification.budgetMinUsd == null) missing.push("budget");
  if (qualification.timelineDays == null) missing.push("timeline");
  if (!qualification.serviceType) missing.push("serviceType");
  return missing;
}

function buildAssistantMessage(missingFields, qualification) {
  if (missingFields.length > 0) {
    return FIELD_QUESTIONS[missingFields[0]];
  }

  return `Great, thanks. We have enough details. Budget starts around $${qualification.budgetMinUsd}, timeline about ${qualification.timelineDays} days, service: ${qualification.serviceType}. Would you like to book a quick call?`;
}

function buildFallbackResponse({ existingQualification, customerMessage }) {
  const merged = {
    budgetMinUsd:
      existingQualification.budgetMinUsd ?? parseBudgetUsd(customerMessage) ?? null,
    budgetMaxUsd: existingQualification.budgetMaxUsd ?? null,
    timelineDays:
      existingQualification.timelineDays ?? parseTimelineDays(customerMessage) ?? null,
    serviceType:
      existingQualification.serviceType ?? parseServiceType(customerMessage) ?? null,
    isDecisionMaker:
      existingQualification.isDecisionMaker ?? parseDecisionMaker(customerMessage),
    notes: existingQualification.notes ?? null,
  };

  const missingFields = findMissingFields(merged);
  const summary =
    missingFields.length === 0
      ? "Lead provided key qualification details."
      : "Qualification is in progress, still collecting required details.";

  return {
    assistantMessage: buildAssistantMessage(missingFields, merged),
    extractedQualification: merged,
    missingFields,
    isQualified: missingFields.length === 0,
    summary,
    provider: "rules",
  };
}

function buildSystemPrompt() {
  return [
    "You are an AI sales qualification assistant for a marketing agency.",
    "Ask concise qualification questions and extract structured lead information.",
    "Always respond with strict JSON only.",
    "JSON schema:",
    "{",
    '  "assistantMessage": "string",',
    '  "extractedQualification": {',
    '    "budgetMinUsd": number|null,',
    '    "budgetMaxUsd": number|null,',
    '    "timelineDays": number|null,',
    '    "serviceType": "ppc"|"seo"|"lead_generation"|"social_media"|"web"|null,',
    '    "isDecisionMaker": boolean|null,',
    '    "notes": "string|null"',
    "  },",
    '  "missingFields": ["budget"|"timeline"|"serviceType"],',
    '  "isQualified": boolean,',
    '  "summary": "string"',
    "}",
    "If required data is missing, ask exactly one next question in assistantMessage.",
    "If required data is complete, assistantMessage should ask for booking a call.",
  ].join("\n");
}

async function callOpenAi({ lead, messages, existingQualification, customerMessage }) {
  if (!config.openAiApiKey) {
    return null;
  }

  const userPayload = {
    lead: {
      id: lead.id,
      source: lead.source,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
    },
    existingQualification,
    latestCustomerMessage: customerMessage ?? null,
    transcript: messages.map((m) => ({
      sender: m.sender,
      message: m.message,
      createdAt: m.created_at,
    })),
    requiredFields: REQUIRED_FIELDS,
  };

  let result;
  try {
    result = await requestJson(`${config.openAiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openAiModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      retryLabel: "openai_chat_completion",
    });
  } catch (error) {
    logger.error("openai_call_failed_network", {
      error: error.message,
    });
    return null;
  }

  if (!result.ok) {
    logger.error("openai_call_failed", {
      status: result.status,
      body: result.body,
    });
    return null;
  }

  const json = result.body;
  const content = json?.choices?.[0]?.message?.content;
  const parsed = extractJsonFromContent(content);
  if (!parsed) {
    logger.error("openai_invalid_json", { content });
    return null;
  }

  return {
    assistantMessage: parsed.assistantMessage,
    extractedQualification: parsed.extractedQualification ?? {},
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
    isQualified: Boolean(parsed.isQualified),
    summary: parsed.summary ?? "Qualification updated.",
    provider: "openai",
  };
}

export async function generateConversationTurn({
  lead,
  messages,
  existingQualification,
  customerMessage,
}) {
  const aiResponse = await callOpenAi({
    lead,
    messages,
    existingQualification,
    customerMessage,
  });

  if (aiResponse) {
    return aiResponse;
  }

  return buildFallbackResponse({
    existingQualification,
    customerMessage,
  });
}
