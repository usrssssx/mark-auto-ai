import { pool } from "../db/pool.js";
import { markLeadAsBooked, markLeadBookingCanceled } from "./bookingService.js";

async function findLeadByLeadId(leadId, tenantKey) {
  if (!leadId) return null;

  const query = tenantKey
    ? `
      SELECT l.id
      FROM leads l
      JOIN tenants t ON t.id = l.tenant_id
      WHERE l.id = $1 AND t."key" = $2
      LIMIT 1;
    `
    : `
      SELECT l.id
      FROM leads l
      WHERE l.id = $1
      LIMIT 1;
    `;
  const params = tenantKey ? [leadId, tenantKey] : [leadId];
  const result = await pool.query(query, params);
  return result.rows[0]?.id ?? null;
}

async function findLeadByExternalLeadId(externalLeadId, tenantKey) {
  if (!externalLeadId || !tenantKey) return null;

  const result = await pool.query(
    `
      SELECT l.id
      FROM leads l
      JOIN tenants t ON t.id = l.tenant_id
      WHERE l.external_lead_id = $1 AND t."key" = $2
      ORDER BY l.created_at DESC
      LIMIT 1;
    `,
    [externalLeadId, tenantKey],
  );

  return result.rows[0]?.id ?? null;
}

async function findLeadByEmail(attendeeEmail, tenantKey) {
  if (!attendeeEmail) return null;

  const query = tenantKey
    ? `
      SELECT l.id
      FROM leads l
      JOIN tenants t ON t.id = l.tenant_id
      WHERE l.email = $1 AND t."key" = $2
      ORDER BY l.created_at DESC
      LIMIT 1;
    `
    : `
      SELECT l.id
      FROM leads l
      WHERE l.email = $1
      ORDER BY l.created_at DESC
      LIMIT 1;
    `;
  const params = tenantKey ? [attendeeEmail, tenantKey] : [attendeeEmail];
  const result = await pool.query(query, params);
  return result.rows[0]?.id ?? null;
}

async function resolveLeadId(payload) {
  return (
    (await findLeadByLeadId(payload.leadId, payload.tenantKey)) ??
    (await findLeadByExternalLeadId(payload.externalLeadId, payload.tenantKey)) ??
    (await findLeadByEmail(payload.attendeeEmail, payload.tenantKey))
  );
}

export async function handleBookingWebhook(payload) {
  const leadId = await resolveLeadId(payload);
  if (!leadId) {
    return {
      notFound: true,
    };
  }

  const metadata = {
    source: "booking_webhook",
    ...(payload.metadata ?? {}),
  };

  if (payload.eventType === "meeting_booked") {
    const updated = await markLeadAsBooked({
      leadId,
      startsAt: payload.startsAt ?? null,
      endsAt: payload.endsAt ?? null,
      metadata,
    });

    return {
      notFound: false,
      leadId,
      bookingStatus: updated?.booking_status ?? "booked",
      meetingStartAt: updated?.meeting_start_at ?? null,
      meetingEndAt: updated?.meeting_end_at ?? null,
    };
  }

  const updated = await markLeadBookingCanceled({
    leadId,
    startsAt: payload.startsAt ?? null,
    endsAt: payload.endsAt ?? null,
    metadata,
  });

  return {
    notFound: false,
    leadId,
    bookingStatus: updated?.booking_status ?? "canceled",
    meetingStartAt: updated?.meeting_start_at ?? null,
    meetingEndAt: updated?.meeting_end_at ?? null,
  };
}

