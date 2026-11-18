import { Router } from "express";
import { z } from "zod";
import { createOrder, getOrder } from "../orders/service.js";

export const ordersRouter = Router();

const CreateOrder = z.object({ customerId: z.string().uuid(), lines: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1) });

ordersRouter.post("/", async (req, res) => {
  const body = CreateOrder.safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  res.status(201).json(await createOrder(body.data));
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.sendStatus(404);
  res.json(order);
});
