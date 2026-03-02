import { z } from "zod";

const contactSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().min(3).max(50).optional(),
  })
  .optional();

export const leadWebhookSchema = z.object({
  source: z.enum([
    "website_form",
    "website_chat",
    "telegram",
    "whatsapp",
    "manual",
  ]),
  externalLeadId: z.string().max(255).optional(),
  idempotencyKey: z.string().max(255).optional(),
  tenantKey: z.string().min(1).max(100).optional(),
  contact: contactSchema,
  message: z.string().max(4000).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
});

