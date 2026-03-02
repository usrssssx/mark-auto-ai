import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { requestJson } from "../lib/httpClient.js";
import { logger } from "../lib/logger.js";

function parseHubspotErrorBody(body) {
  if (!body) return "";
  if (typeof body === "string") return body.slice(0, 500);
  return JSON.stringify(body).slice(0, 500);
}

async function hubspotRequest(path, { method = "GET", body } = {}) {
  const result = await requestJson(`${config.hubspotBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.hubspotAccessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    retryLabel: `hubspot_${method.toLowerCase()}_${path}`,
  });

  if (!result.ok) {
    const error = new Error(`HubSpot request failed: ${method} ${path}`);
    error.httpStatus = result.status;
    error.details = parseHubspotErrorBody(result.body);
    throw error;
  }

  if (result.status === 204) {
    return null;
  }

  return result.body;
}

async function searchContactByEmail(email) {
  if (!email) return null;

  const payload = {
    filterGroups: [
      {
        filters: [{ propertyName: "email", operator: "EQ", value: email }],
      },
    ],
    properties: ["email", "firstname", "lastname", "phone"],
    limit: 1,
  };

  const result = await hubspotRequest("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: payload,
  });

  return result?.results?.[0] ?? null;
}

async function searchContactByPhone(phone) {
  if (!phone) return null;

  const payload = {
    filterGroups: [
      {
        filters: [{ propertyName: "phone", operator: "EQ", value: phone }],
      },
    ],
    properties: ["email", "firstname", "lastname", "phone"],
    limit: 1,
  };

  const result = await hubspotRequest("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: payload,
  });

  return result?.results?.[0] ?? null;
}

function splitName(fullName) {
  if (!fullName) {
    return { firstName: null, lastName: null };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function upsertContact(lead) {
  if (!lead.email && !lead.phone) {
    const error = new Error("Lead has no email or phone for HubSpot contact upsert");
    error.httpStatus = 400;
    throw error;
  }

  const { firstName, lastName } = splitName(lead.name);
  const existingByEmail = await searchContactByEmail(lead.email);
  const existing = existingByEmail ?? (await searchContactByPhone(lead.phone));

  const properties = {
    email: lead.email ?? undefined,
    firstname: firstName ?? undefined,
    lastname: lastName ?? undefined,
    phone: lead.phone ?? undefined,
  };

  Object.keys(properties).forEach((key) => {
    if (properties[key] == null) {
      delete properties[key];
    }
  });

  if (existing) {
    await hubspotRequest(`/crm/v3/objects/contacts/${existing.id}`, {
      method: "PATCH",
      body: { properties },
    });
    return existing.id;
  }

  const created = await hubspotRequest("/crm/v3/objects/contacts", {
    method: "POST",
    body: { properties },
  });
  return created.id;
}

function buildDealName(lead, score) {
  const namePart = lead.name || lead.email || lead.phone || lead.id;
  return `${config.hubspotDealNamePrefix}: ${namePart} (${score})`;
}

function buildDealProperties({ lead, qualification, scoring }) {
  const properties = {
    dealname: buildDealName(lead, scoring.score),
    amount:
      qualification.budgetMinUsd != null
        ? String(qualification.budgetMinUsd)
        : undefined,
    pipeline: config.hubspotDefaultPipeline || undefined,
    dealstage: config.hubspotDefaultDealStage || undefined,
  };

  Object.keys(properties).forEach((key) => {
    if (properties[key] == null || properties[key] === "") {
      delete properties[key];
    }
  });

  return properties;
}

async function upsertDeal({ lead, qualification, scoring, existingDealId }) {
  const properties = buildDealProperties({ lead, qualification, scoring });

  if (existingDealId) {
    await hubspotRequest(`/crm/v3/objects/deals/${existingDealId}`, {
      method: "PATCH",
      body: { properties },
    });
    return existingDealId;
  }

  const created = await hubspotRequest("/crm/v3/objects/deals", {
    method: "POST",
    body: { properties },
  });
  return created.id;
}

async function associateDealWithContact({ dealId, contactId }) {
  await hubspotRequest(
    `/crm/v4/objects/deals/${dealId}/associations/default/contacts/${contactId}`,
    { method: "PUT" },
  );
}

async function updateLeadSyncState({
  leadId,
  status,
  contactId = null,
  dealId = null,
  error = null,
}) {
  await pool.query(
    `
      UPDATE leads
      SET
        hubspot_sync_status = $2,
        hubspot_contact_id = COALESCE($3, hubspot_contact_id),
        hubspot_deal_id = COALESCE($4, hubspot_deal_id),
        hubspot_sync_error = $5,
        hubspot_last_synced_at = CASE WHEN $2 = 'succeeded' THEN now() ELSE hubspot_last_synced_at END,
        updated_at = now()
      WHERE id = $1;
    `,
    [leadId, status, contactId, dealId, error],
  );
}

async function appendLeadEvent(leadId, eventType, payload) {
  await pool.query(
    `
      INSERT INTO lead_events (lead_id, event_type, event_payload)
      VALUES ($1, $2, $3::jsonb);
    `,
    [leadId, eventType, JSON.stringify(payload)],
  );
}

export async function syncLeadToHubspot({
  lead,
  qualification,
  scoring,
  force = false,
}) {
  if (!config.hubspotAccessToken) {
    await updateLeadSyncState({
      leadId: lead.id,
      status: "skipped",
      error: "HUBSPOT_ACCESS_TOKEN is not configured",
    });
    await appendLeadEvent(lead.id, "hubspot_sync_skipped", {
      reason: "missing_access_token",
    });

    return {
      status: "skipped",
      reason: "missing_access_token",
    };
  }

  if (!force && lead.status === "qualified" && lead.hubspot_sync_status === "succeeded") {
    return {
      status: "already_synced",
      contactId: lead.hubspot_contact_id,
      dealId: lead.hubspot_deal_id,
    };
  }

  try {
    const contactId = await upsertContact(lead);
    const dealId = await upsertDeal({
      lead,
      qualification,
      scoring,
      existingDealId: lead.hubspot_deal_id,
    });
    await associateDealWithContact({ dealId, contactId });

    await updateLeadSyncState({
      leadId: lead.id,
      status: "succeeded",
      contactId,
      dealId,
      error: null,
    });
    await appendLeadEvent(lead.id, "hubspot_sync_succeeded", {
      contactId,
      dealId,
      score: scoring.score,
      temperature: scoring.temperature,
    });

    return {
      status: "succeeded",
      contactId,
      dealId,
    };
  } catch (error) {
    const message = `${error.message}${error.details ? ` | ${error.details}` : ""}`.slice(
      0,
      1000,
    );

    logger.error("hubspot_sync_failed", {
      leadId: lead.id,
      error: message,
      status: error.httpStatus ?? null,
    });

    await updateLeadSyncState({
      leadId: lead.id,
      status: "failed",
      error: message,
    });
    await appendLeadEvent(lead.id, "hubspot_sync_failed", {
      error: message,
      score: scoring.score,
      temperature: scoring.temperature,
    });

    return {
      status: "failed",
      error: message,
    };
  }
}
