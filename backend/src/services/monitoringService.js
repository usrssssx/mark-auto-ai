import { pool } from "../db/pool.js";

function rowsToMap(rows) {
  return rows.reduce((acc, row) => {
    acc[row.key] = Number(row.value);
    return acc;
  }, {});
}

export async function getMonitoringOverview() {
  const [leadStatusesRes, bookingStatusesRes, hubspotStatusesRes, totalsRes, events24hRes] =
    await Promise.all([
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
            COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified_total,
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
    ]);

  const totals = totalsRes.rows[0] ?? {
    total_leads: 0,
    leads_last_24h: 0,
    avg_score: null,
    qualified_total: 0,
    booked_total: 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalLeads: Number(totals.total_leads ?? 0),
      leadsLast24h: Number(totals.leads_last_24h ?? 0),
      qualifiedTotal: Number(totals.qualified_total ?? 0),
      bookedTotal: Number(totals.booked_total ?? 0),
      avgScore: totals.avg_score == null ? null : Number(totals.avg_score),
    },
    leadStatuses: rowsToMap(leadStatusesRes.rows),
    bookingStatuses: rowsToMap(bookingStatusesRes.rows),
    hubspotSyncStatuses: rowsToMap(hubspotStatusesRes.rows),
    eventsLast24h: events24hRes.rows.map((row) => ({
      eventType: row.event_type,
      count: Number(row.count_last_24h),
    })),
  };
}

