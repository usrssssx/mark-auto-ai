import express from "express";
import { bookingWebhookSchema } from "../schemas/bookingWebhookSchema.js";
import { leadWebhookSchema } from "../schemas/leadWebhookSchema.js";
import { handleBookingWebhook } from "../services/bookingWebhookService.js";
import { intakeLead } from "../services/leadIntakeService.js";

export const leadWebhookRouter = express.Router();

leadWebhookRouter.post("/lead", async (req, res, next) => {
  try {
    const parsed = leadWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const result = await intakeLead({
      parsedBody: parsed.data,
      headers: req.headers,
    });

    if (result.duplicate) {
      return res.status(200).json({
        status: "already_processed",
        duplicate: true,
        leadId: result.leadId,
      });
    }

    return res.status(201).json({
      status: "accepted",
      duplicate: false,
      leadId: result.leadId,
    });
  } catch (error) {
    return next(error);
  }
});

leadWebhookRouter.post("/booking", async (req, res, next) => {
  try {
    const parsed = bookingWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const result = await handleBookingWebhook(parsed.data);
    if (result.notFound) {
      return res.status(404).json({
        error: "lead_not_found_for_booking_event",
      });
    }

    return res.status(200).json({
      status: "processed",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});
