import { Router } from "express";
import { z } from "zod";
import { issueRefund } from "../billing/refund.js";

export const refundsRouter = Router();

const RefundRequest = z.object({ invoiceId: z.string().uuid(), amountCents: z.number().int().positive() });

refundsRouter.post("/", async (req, res) => {
  const body = RefundRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  res.status(201).json(await issueRefund(body.data.invoiceId, body.data.amountCents));
});
