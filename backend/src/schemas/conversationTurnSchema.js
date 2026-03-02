import { z } from "zod";

export const conversationTurnSchema = z
  .object({
    leadId: z.string().uuid(),
    tenantKey: z.string().min(1).max(100).optional(),
    customerMessage: z.string().min(1).max(4000).optional(),
  })
  .superRefine((payload, ctx) => {
    if (!payload.customerMessage) {
      return;
    }

    if (payload.customerMessage.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customerMessage cannot be blank",
        path: ["customerMessage"],
      });
    }
  });

