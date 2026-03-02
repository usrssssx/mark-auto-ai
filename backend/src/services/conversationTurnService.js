import { pool } from "../db/pool.js";
import { generateConversationTurn } from "./aiConversationService.js";
import { scoreLead } from "./scoringService.js";

function normalizeQualification(raw) {
  return {
    budgetMinUsd:
      raw?.budgetMinUsd == null ? null : Number.parseInt(raw.budgetMinUsd, 10),
    budgetMaxUsd:
      raw?.budgetMaxUsd == null ? null : Number.parseInt(raw.budgetMaxUsd, 10),
    timelineDays:
      raw?.timelineDays == null ? null : Number.parseInt(raw.timelineDays, 10),
    serviceType: raw?.serviceType ?? null,
    isDecisionMaker:
      raw?.isDecisionMaker == null ? null : Boolean(raw.isDecisionMaker),
    notes: raw?.notes ?? null,
  };
}

function mergeQualification(base, incoming) {
  const normalizedBase = normalizeQualification(base);
  const normalizedIncoming = normalizeQualification(incoming);

  return {
    budgetMinUsd:
      normalizedIncoming.budgetMinUsd ?? normalizedBase.budgetMinUsd ?? null,
    budgetMaxUsd:
      normalizedIncoming.budgetMaxUsd ?? normalizedBase.budgetMaxUsd ?? null,
    timelineDays: normalizedIncoming.timelineDays ?? normalizedBase.timelineDays ?? null,
    serviceType: normalizedIncoming.serviceType ?? normalizedBase.serviceType ?? null,
    isDecisionMaker:
      normalizedIncoming.isDecisionMaker ?? normalizedBase.isDecisionMaker ?? null,
    notes: normalizedIncoming.notes ?? normalizedBase.notes ?? null,
  };
}

function qualificationIsComplete(qualification) {
  return Boolean(
    qualification.budgetMinUsd != null &&
      qualification.timelineDays != null &&
      qualification.serviceType,
  );
}

export async function processConversationTurn({
  leadId,
  tenantKey,
  customerMessage,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const leadResult = await client.query(
      `
        SELECT l.*, t."key" AS tenant_key
        FROM leads l
        JOIN tenants t ON t.id = l.tenant_id
        WHERE l.id = $1;
      `,
      [leadId],
    );

    if (leadResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        notFound: true,
      };
    }

    const lead = leadResult.rows[0];
    if (tenantKey && lead.tenant_key !== tenantKey) {
      await client.query("ROLLBACK");
      return {
        forbidden: true,
      };
    }

    if (customerMessage) {
      await client.query(
        `
          INSERT INTO conversation_messages (lead_id, sender, message)
          VALUES ($1, 'lead', $2);
        `,
        [leadId, customerMessage],
      );
    }

    const historyResult = await client.query(
      `
        SELECT sender, message, created_at
        FROM conversation_messages
        WHERE lead_id = $1
        ORDER BY created_at ASC, id ASC;
      `,
      [leadId],
    );

    const currentQualification = normalizeQualification(lead.qualification_json ?? {});

    const aiTurn = await generateConversationTurn({
      lead,
      messages: historyResult.rows,
      existingQualification: currentQualification,
      customerMessage: customerMessage ?? null,
    });

    const mergedQualification = mergeQualification(
      currentQualification,
      aiTurn.extractedQualification,
    );

    const scoring = scoreLead(mergedQualification);
    const isComplete = qualificationIsComplete(mergedQualification);
    const nextStatus = isComplete ? "qualified" : "qualification_in_progress";

    await client.query(
      `
        UPDATE leads
        SET
          qualification_json = $2::jsonb,
          lead_score = $3,
          lead_temperature = $4,
          ai_summary = $5,
          status = $6,
          updated_at = now()
        WHERE id = $1;
      `,
      [
        leadId,
        JSON.stringify(mergedQualification),
        scoring.score,
        scoring.temperature,
        aiTurn.summary,
        nextStatus,
      ],
    );

    await client.query(
      `
        INSERT INTO conversation_messages (lead_id, sender, message, ai_payload)
        VALUES ($1, 'assistant', $2, $3::jsonb);
      `,
      [leadId, aiTurn.assistantMessage, JSON.stringify(aiTurn)],
    );

    await client.query(
      `
        INSERT INTO lead_events (lead_id, event_type, event_payload)
        VALUES ($1, 'qualification_updated', $2::jsonb);
      `,
      [
        leadId,
        JSON.stringify({
          provider: aiTurn.provider,
          qualification: mergedQualification,
          scoring,
          isQualified: isComplete,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      notFound: false,
      forbidden: false,
      leadId,
      provider: aiTurn.provider,
      assistantMessage: aiTurn.assistantMessage,
      qualification: mergedQualification,
      scoring,
      status: nextStatus,
      isQualified: isComplete,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

