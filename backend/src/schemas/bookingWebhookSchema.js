import { z } from "zod";

export const bookingWebhookSchema = z.object({
  eventType: z.enum(["meeting_booked", "meeting_canceled"]),
  leadId: z.string().uuid().optional(),
  tenantKey: z.string().min(1).max(100).optional(),
  externalLeadId: z.string().max(255).optional(),
  attendeeEmail: z.string().email().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

