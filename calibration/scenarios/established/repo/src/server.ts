import express from "express";
import { ordersRouter } from "./routes/orders.js";
import { healthRouter } from "./routes/health.js";
import { refundsRouter } from "./routes/refunds.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/health", healthRouter);
  app.use("/orders", ordersRouter);
  app.use("/refunds", refundsRouter);
  return app;
}

if (process.env.NODE_ENV !== "test") {
  createApp().listen(Number(process.env.PORT ?? 3000));
}
