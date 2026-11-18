import { serve } from "@hono/node-server";
import { app } from "./http/app.js";

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) });
