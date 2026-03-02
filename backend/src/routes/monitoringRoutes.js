import express from "express";
import { buildMonitoringDashboardHtml } from "../services/dashboardTemplateService.js";
import { getMonitoringOverview } from "../services/monitoringService.js";

export const monitoringRouter = express.Router();

monitoringRouter.get("/overview", async (_req, res, next) => {
  try {
    const overview = await getMonitoringOverview();
    return res.status(200).json(overview);
  } catch (error) {
    return next(error);
  }
});

monitoringRouter.get("/dashboard", (_req, res) => {
  return res.status(200).type("html").send(buildMonitoringDashboardHtml());
});
