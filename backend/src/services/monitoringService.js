import { pool } from "../db/pool.js";

function rowsToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.key] = Number(row.value);
    return acc;
  }, {});
}

export async function getMonitoringOverview() {
  const [
    leadStatusesRes,
    bookingStatusesRes,
    hubspotStatusesRes,
    totalsRes,
    events24hRes,
    latestLeadsRes,
  ] = await Promise.all([
      pool.query(
        `
          SELECT status AS key, COUNT(*)::int AS value
          FROM leads
          GROUP BY status
          ORDER BY status;
        `,
      ),
      pool.query(
        `
          SELECT booking_status AS key, COUNT(*)::int AS value
          FROM leads
          GROUP BY booking_status
          ORDER BY booking_status;
        `,
      ),
      pool.query(
        `
          SELECT hubspot_sync_status AS key, COUNT(*)::int AS value
          FROM leads
          GROUP BY hubspot_sync_status
          ORDER BY hubspot_sync_status;
        `,
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_leads,
            COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS leads_last_24h,
            ROUND(AVG(lead_score)::numeric, 2) AS avg_score,
            COUNT(*) FILTER (WHERE status IN ('qualified', 'meeting_booked'))::int AS qualified_total,
            COUNT(*) FILTER (WHERE status = 'meeting_booked')::int AS booked_total
          FROM leads;
        `,
      ),
      pool.query(
        `
          SELECT
            event_type,
            COUNT(*)::int AS count_last_24h
          FROM lead_events
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY event_type
          ORDER BY count_last_24h DESC, event_type ASC;
        `,
      ),
      pool.query(
        `
          SELECT
            id,
            source,
            status,
            lead_score,
            lead_temperature,
            booking_status,
            hubspot_sync_status,
            created_at
          FROM leads
          ORDER BY created_at DESC
          LIMIT 10;
        `,
      ),
    ]);

  const totals = totalsRes.rows[0] ?? {
    total_leads: 0,
    leads_last_24h: 0,
    avg_score: null,
    qualified_total: 0,
    booked_total: 0,
  };

  const totalLeads = Number(totals.total_leads ?? 0);
  const qualifiedTotal = Number(totals.qualified_total ?? 0);
  const bookedTotal = Number(totals.booked_total ?? 0);

  const qualificationRatePct =
    totalLeads > 0 ? Number(((qualifiedTotal / totalLeads) * 100).toFixed(2)) : 0;
  const bookingRatePct =
    totalLeads > 0 ? Number(((bookedTotal / totalLeads) * 100).toFixed(2)) : 0;
  const closeFromQualifiedPct =
    qualifiedTotal > 0 ? Number(((bookedTotal / qualifiedTotal) * 100).toFixed(2)) : 0;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalLeads,
      leadsLast24h: Number(totals.leads_last_24h ?? 0),
      qualifiedTotal,
      bookedTotal,
      avgScore: totals.avg_score == null ? null : Number(totals.avg_score),
    },
    funnel: {
      qualificationRatePct,
      bookingRatePct,
      closeFromQualifiedPct,
    },
    leadStatuses: rowsToMap(leadStatusesRes.rows),
    bookingStatuses: rowsToMap(bookingStatusesRes.rows),
    hubspotSyncStatuses: rowsToMap(hubspotStatusesRes.rows),
    eventsLast24h: events24hRes.rows.map((row) => ({
      eventType: row.event_type,
      count: Number(row.count_last_24h),
    })),
    latestLeads: latestLeadsRes.rows.map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      score: row.lead_score,
      temperature: row.lead_temperature,
      bookingStatus: row.booking_status,
      hubspotSyncStatus: row.hubspot_sync_status,
      createdAt: row.created_at,
    })),
  };
}
