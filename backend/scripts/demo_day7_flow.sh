#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TENANT_KEY="${TENANT_KEY:-default}"
EXTERNAL_LEAD_ID="demo-$(date +%s)"
IDEMPOTENCY_KEY="demo-${EXTERNAL_LEAD_ID}"

lead_payload=$(
  cat <<JSON
{
  "source": "website_form",
  "externalLeadId": "${EXTERNAL_LEAD_ID}",
  "tenantKey": "${TENANT_KEY}",
  "contact": {
    "name": "Day7 Demo Lead",
    "email": "day7-demo-${EXTERNAL_LEAD_ID}@example.com"
  },
  "message": "Need PPC services"
}
JSON
)

echo "1) Creating lead via /webhooks/lead"
lead_response=$(curl -sS -X POST "${BASE_URL}/webhooks/lead" \
  -H "Content-Type: application/json" \
  -H "x-tenant-key: ${TENANT_KEY}" \
  -H "x-idempotency-key: ${IDEMPOTENCY_KEY}" \
  --data "${lead_payload}")
echo "${lead_response}"

lead_id=$(printf "%s" "${lead_response}" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(d.leadId || "");')
if [ -z "${lead_id}" ]; then
  echo "Could not extract leadId from /webhooks/lead response"
  exit 1
fi

echo ""
echo "2) Qualifying lead via /conversation/next"
conversation_payload=$(
  cat <<JSON
{
  "leadId": "${lead_id}",
  "tenantKey": "${TENANT_KEY}",
  "customerMessage": "Budget is \$6500, need PPC, launch in 14 days."
}
JSON
)
conversation_response=$(curl -sS -X POST "${BASE_URL}/conversation/next" \
  -H "Content-Type: application/json" \
  --data "${conversation_payload}")
echo "${conversation_response}"

echo ""
echo "3) Simulating booking webhook via /webhooks/booking"
starts_at=$(node -e 'const d=new Date(Date.now()+24*60*60*1000);process.stdout.write(d.toISOString());')
ends_at=$(node -e 'const d=new Date(Date.now()+24*60*60*1000+30*60*1000);process.stdout.write(d.toISOString());')
booking_payload=$(
  cat <<JSON
{
  "eventType": "meeting_booked",
  "leadId": "${lead_id}",
  "tenantKey": "${TENANT_KEY}",
  "startsAt": "${starts_at}",
  "endsAt": "${ends_at}",
  "metadata": {
    "provider": "demo",
    "eventUri": "demo://booking/${lead_id}"
  }
}
JSON
)
booking_response=$(curl -sS -X POST "${BASE_URL}/webhooks/booking" \
  -H "Content-Type: application/json" \
  --data "${booking_payload}")
echo "${booking_response}"

echo ""
echo "4) Fetching monitoring overview via /monitoring/overview"
monitoring_response=$(curl -sS "${BASE_URL}/monitoring/overview")
printf "%s" "${monitoring_response}" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(JSON.stringify(d,null,2));'

echo ""
echo "Demo flow complete for leadId: ${lead_id}"

