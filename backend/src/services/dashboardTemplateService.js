export function buildMonitoringDashboardHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Automation Monitoring</title>
    <style>
      :root {
        --bg: #f3f7f5;
        --panel: #ffffff;
        --ink: #17322d;
        --muted: #61746f;
        --accent: #008a6a;
        --accent-soft: #d6f5eb;
        --danger: #b91c1c;
        --ok: #0f766e;
        --border: #d9e6e1;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top right, #dbf6e9 0%, rgba(219, 246, 233, 0) 38%),
          radial-gradient(circle at bottom left, #d9edf8 0%, rgba(217, 237, 248, 0) 36%),
          var(--bg);
      }
      .wrap {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px 16px 36px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
        font-size: 1.7rem;
        letter-spacing: 0.02em;
      }
      .sub {
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
        margin: 18px 0;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 8px 24px rgba(6, 31, 23, 0.04);
      }
      .label {
        color: var(--muted);
        font-size: 0.85rem;
      }
      .value {
        margin-top: 6px;
        font-weight: 700;
        font-size: 1.35rem;
      }
      .section {
        margin-top: 14px;
      }
      .section h2 {
        margin: 0 0 10px;
        font-size: 1.1rem;
      }
      .kpi-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 9px;
        background: var(--accent-soft);
        color: var(--ok);
        font-size: 0.8rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
      }
      th, td {
        border-bottom: 1px solid var(--border);
        text-align: left;
        padding: 10px 12px;
        font-size: 0.9rem;
      }
      th {
        background: #f0faf7;
        color: #29443f;
      }
      tr:last-child td { border-bottom: 0; }
      .muted { color: var(--muted); font-size: 0.85rem; }
      .err { color: var(--danger); }
      .ok { color: var(--ok); }
      @media (max-width: 760px) {
        .hero { flex-direction: column; align-items: flex-start; gap: 4px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div>
          <h1>AI Automation Ops Dashboard</h1>
          <div class="sub">Lead pipeline, qualification, booking and CRM sync status</div>
        </div>
        <div id="updatedAt" class="muted">Loading...</div>
      </div>

      <div id="totals" class="grid"></div>

      <div class="section">
        <h2>Conversion Funnel</h2>
        <div id="funnel" class="kpi-list"></div>
      </div>

      <div class="section">
        <h2>Status Distribution</h2>
        <div id="statusBlocks" class="kpi-list"></div>
      </div>

      <div class="section">
        <h2>Event Volume (24h)</h2>
        <div id="events24h" class="kpi-list"></div>
      </div>

      <div class="section">
        <h2>Latest Leads</h2>
        <table>
          <thead>
            <tr>
              <th>Lead ID</th>
              <th>Status</th>
              <th>Score</th>
              <th>Booking</th>
              <th>HubSpot</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody id="latestLeadsBody"></tbody>
        </table>
      </div>
      <p id="errorBox" class="err"></p>
    </div>

    <script>
      const fmtPct = (v) => (typeof v === "number" ? v.toFixed(2) + "%" : "-");
      const fmtNum = (v) => (v == null ? "-" : String(v));

      function renderTotals(data) {
        const map = [
          ["Total Leads", data.totals.totalLeads],
          ["Leads (24h)", data.totals.leadsLast24h],
          ["Qualified", data.totals.qualifiedTotal],
          ["Booked", data.totals.bookedTotal],
          ["Avg Score", data.totals.avgScore]
        ];
        document.getElementById("totals").innerHTML = map
          .map(([label, value]) => \`
            <article class="card">
              <div class="label">\${label}</div>
              <div class="value">\${fmtNum(value)}</div>
            </article>
          \`).join("");
      }

      function renderFunnel(data) {
        const map = [
          ["Qualification rate", fmtPct(data.funnel.qualificationRatePct)],
          ["Booking rate", fmtPct(data.funnel.bookingRatePct)],
          ["Close from qualified", fmtPct(data.funnel.closeFromQualifiedPct)]
        ];
        document.getElementById("funnel").innerHTML = map
          .map(([label, value]) => \`
            <article class="card">
              <div class="label">\${label}</div>
              <div class="value">\${value}</div>
            </article>
          \`).join("");
      }

      function renderStatusBlocks(data) {
        const blocks = [
          ["Lead status", data.leadStatuses],
          ["Booking status", data.bookingStatuses],
          ["HubSpot sync", data.hubspotSyncStatuses]
        ];
        document.getElementById("statusBlocks").innerHTML = blocks.map(([title, obj]) => {
          const content = Object.entries(obj).map(([k, v]) =>
            \`<span class="pill">\${k}: <strong>\${v}</strong></span>\`
          ).join(" ");
          return \`<article class="card"><div class="label">\${title}</div><div class="value" style="font-size:1rem;font-weight:600;">\${content || "-"}</div></article>\`;
        }).join("");
      }

      function renderEvents(data) {
        document.getElementById("events24h").innerHTML = data.eventsLast24h.map((event) => \`
          <article class="card">
            <div class="label">\${event.eventType}</div>
            <div class="value">\${event.count}</div>
          </article>
        \`).join("") || '<div class="muted">No events in the last 24h.</div>';
      }

      function renderLatestLeads(data) {
        const rows = data.latestLeads.map((lead) => \`
          <tr>
            <td class="muted">\${lead.id}</td>
            <td>\${lead.status}</td>
            <td>\${lead.score ?? "-"}</td>
            <td>\${lead.bookingStatus}</td>
            <td>\${lead.hubspotSyncStatus}</td>
            <td class="muted">\${new Date(lead.createdAt).toLocaleString()}</td>
          </tr>
        \`).join("");
        document.getElementById("latestLeadsBody").innerHTML =
          rows || '<tr><td colspan="6" class="muted">No leads yet.</td></tr>';
      }

      async function load() {
        const errorBox = document.getElementById("errorBox");
        errorBox.textContent = "";
        try {
          const response = await fetch("/monitoring/overview");
          if (!response.ok) {
            throw new Error("HTTP " + response.status);
          }
          const data = await response.json();
          document.getElementById("updatedAt").textContent =
            "Updated: " + new Date(data.generatedAt).toLocaleString();
          renderTotals(data);
          renderFunnel(data);
          renderStatusBlocks(data);
          renderEvents(data);
          renderLatestLeads(data);
        } catch (error) {
          errorBox.textContent = "Dashboard update failed: " + error.message;
        }
      }

      load();
      setInterval(load, 15000);
    </script>
  </body>
</html>`;
}

