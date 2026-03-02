import { config } from "../config.js";
import { pool } from "../db/pool.js";

function isEligibleForBooking(scoring) {
  if (!scoring) return false;
  if (scoring.score < config.bookingMinScore) return false;
  return scoring.temperature === "hot" || scoring.temperature === "warm";
}

function appendQueryParams(rawUrl, params) {
  try {
    const url = new URL(rawUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function buildBookingLink(lead) {
  if (!config.bookingCalendlyUrl) return null;

  return appendQueryParams(config.bookingCalendlyUrl, {
    name: lead.name ?? undefined,
    email: lead.email ?? undefined,
    lead_id: lead.id,
  });
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

export async function ensureBookingInvitation({ lead, scoring }) {
  if (!isEligibleForBooking(scoring)) {
    return {
      status: "not_eligible",
      reason: "score_below_threshold",
    };
  }

  if (lead.booking_status === "booked") {
    return {
      status: "already_booked",
      bookingLink: lead.booking_link,
      provider: lead.booking_provider,
    };
  }

  if (lead.booking_status === "invited" && lead.booking_link) {
    return {
      status: "already_invited",
      bookingLink: lead.booking_link,
      provider: lead.booking_provider,
    };
  }

  const bookingLink = buildBookingLink(lead);
  if (!bookingLink) {
    await pool.query(
      `
        UPDATE leads
        SET
          booking_status = 'skipped',
          booking_metadata = booking_metadata || $2::jsonb,
          updated_at = now()
        WHERE id = $1;
      `,
      [
        lead.id,
        JSON.stringify({
          reason: "missing_booking_url",
        }),
      ],
    );

    await appendLeadEvent(lead.id, "booking_invite_skipped", {
      reason: "missing_booking_url",
    });

    return {
      status: "skipped",
      reason: "missing_booking_url",
    };
  }

  await pool.query(
    `
      UPDATE leads
      SET
        booking_provider = $2,
        booking_link = $3,
        booking_status = 'invited',
        booking_invited_at = now(),
        booking_metadata = booking_metadata || $4::jsonb,
        updated_at = now()
      WHERE id = $1;
    `,
    [
      lead.id,
      config.bookingProvider,
      bookingLink,
      JSON.stringify({
        invitedBy: "automation",
        minScore: config.bookingMinScore,
      }),
    ],
  );

  await appendLeadEvent(lead.id, "booking_invited", {
    provider: config.bookingProvider,
    bookingLink,
    score: scoring.score,
    temperature: scoring.temperature,
  });

  return {
    status: "invited",
    provider: config.bookingProvider,
    bookingLink,
  };
}

export async function markLeadAsBooked({
  leadId,
  startsAt = null,
  endsAt = null,
  metadata = {},
}) {
  const result = await pool.query(
    `
      UPDATE leads
      SET
        booking_status = 'booked',
        status = CASE WHEN status = 'qualified' THEN 'meeting_booked' ELSE status END,
        meeting_start_at = COALESCE($2::timestamptz, meeting_start_at),
        meeting_end_at = COALESCE($3::timestamptz, meeting_end_at),
        booking_metadata = booking_metadata || $4::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING id, booking_status, meeting_start_at, meeting_end_at;
    `,
    [leadId, startsAt, endsAt, JSON.stringify(metadata)],
  );

  if (result.rowCount === 0) {
    return null;
  }

  await appendLeadEvent(leadId, "meeting_booked", {
    startsAt,
    endsAt,
    metadata,
  });

  return result.rows[0];
}

export async function markLeadBookingCanceled({
  leadId,
  startsAt = null,
  endsAt = null,
  metadata = {},
}) {
  const result = await pool.query(
    `
      UPDATE leads
      SET
        booking_status = 'canceled',
        meeting_start_at = COALESCE($2::timestamptz, meeting_start_at),
        meeting_end_at = COALESCE($3::timestamptz, meeting_end_at),
        booking_metadata = booking_metadata || $4::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING id, booking_status, meeting_start_at, meeting_end_at;
    `,
    [leadId, startsAt, endsAt, JSON.stringify(metadata)],
  );

  if (result.rowCount === 0) {
    return null;
  }

  await appendLeadEvent(leadId, "meeting_canceled", {
    startsAt,
    endsAt,
    metadata,
  });

  return result.rows[0];
}

