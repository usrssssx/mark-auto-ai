import express from "express";
import { conversationTurnSchema } from "../schemas/conversationTurnSchema.js";
import { processConversationTurn } from "../services/conversationTurnService.js";

export const conversationRouter = express.Router();

conversationRouter.post("/next", async (req, res, next) => {
  try {
    const parsed = conversationTurnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const result = await processConversationTurn(parsed.data);
    if (result.notFound) {
      return res.status(404).json({
        error: "lead_not_found",
      });
    }

    if (result.forbidden) {
      return res.status(403).json({
        error: "tenant_mismatch",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

