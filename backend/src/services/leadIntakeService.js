import crypto from "node:crypto";
import { pool } from "../db/pool.js";

function buildPayloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function deriveIdempotencyKey(parsedBody, headerIdempotencyKey) {
  if (headerIdempotencyKey) {
    return headerIdempotencyKey;
  }
  if (parsedBody.idempotencyKey) {
    return parsedBody.idempotencyKey;
  }

  const base = `${parsedBody.source}:${parsedBody.externalLeadId ?? ""}:${JSON.stringify(
    parsedBody,
  )}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

async function upsertTenant(client, tenantKey) {
  const { rows } = await client.query(
    `
      INSERT INTO tenants ("key", name)
      VALUES ($1, $2)
      ON CONFLICT ("key")
      DO UPDATE SET updated_at = now()
      RETURNING id, "key";
    `,
    [tenantKey, tenantKey],
  );

  return rows[0];
}

export async function intakeLead({ parsedBody, headers }) {
  const tenantKey = headers["x-tenant-key"] ?? parsedBody.tenantKey ?? "default";
  const idempotencyKey = deriveIdempotencyKey(
    parsedBody,
    headers["x-idempotency-key"],
  );
  const payloadHash = buildPayloadHash(parsedBody);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tenant = await upsertTenant(client, tenantKey);

    const receiptInsert = await client.query(
      `
        INSERT INTO webhook_receipts
          (tenant_id, idempotency_key, payload, payload_hash, status)
        VALUES
          ($1, $2, $3::jsonb, $4, 'received')
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING id;
      `,
      [tenant.id, idempotencyKey, JSON.stringify(parsedBody), payloadHash],
    );

    if (receiptInsert.rowCount === 0) {
      const existing = await client.query(
        `
          SELECT lead_id
          FROM webhook_receipts
          WHERE tenant_id = $1 AND idempotency_key = $2;
        `,
        [tenant.id, idempotencyKey],
      );
      await client.query("COMMIT");
      return {
        duplicate: true,
        leadId: existing.rows[0]?.lead_id ?? null,
      };
    }

    const leadInsert = await client.query(
      `
        INSERT INTO leads (
          tenant_id,
          source,
          external_lead_id,
          name,
          email,
          phone,
          message,
          status,
          raw_payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8::jsonb)
        ON CONFLICT (tenant_id, source, external_lead_id)
        WHERE external_lead_id IS NOT NULL
        DO UPDATE
          SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            message = EXCLUDED.message,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = now()
        RETURNING id;
      `,
      [
        tenant.id,
        parsedBody.source,
        parsedBody.externalLeadId ?? null,
        parsedBody.contact?.name ?? null,
        parsedBody.contact?.email ?? null,
        parsedBody.contact?.phone ?? null,
        parsedBody.message ?? null,
        JSON.stringify(parsedBody),
      ],
    );

    const leadId = leadInsert.rows[0].id;

    await client.query(
      `
        INSERT INTO lead_events (lead_id, event_type, event_payload)
        VALUES ($1, 'lead_received', $2::jsonb);
      `,
      [leadId, JSON.stringify({ source: parsedBody.source, idempotencyKey })],
    );

    await client.query(
      `
        UPDATE webhook_receipts
        SET status = 'processed', lead_id = $3
        WHERE tenant_id = $1 AND idempotency_key = $2;
      `,
      [tenant.id, idempotencyKey, leadId],
    );

    await client.query("COMMIT");

    return {
      duplicate: false,
      leadId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
