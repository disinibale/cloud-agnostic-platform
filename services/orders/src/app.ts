import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { OrderStore } from "./store.js";
import { type UsersClient, UsersServiceError } from "./usersClient.js";
import { parseNewOrder } from "./validation.js";

export type Logger = Pick<Console, "error">;

export interface AppDeps {
  usersClient: UsersClient;
  store?: OrderStore;
  logger?: Logger;
}

export function createApp({
  usersClient,
  store = new OrderStore(),
  logger = console,
}: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.post("/orders", async (req: Request, res: Response) => {
    const parsed = parseNewOrder(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { userId } = parsed.value;

    let exists: boolean;
    try {
      exists = await usersClient.userExists(userId);
    } catch (err) {
      if (err instanceof UsersServiceError) {
        logger.error(err.message);
        res.status(502).json({ error: "users service unavailable" });
        return;
      }
      throw err;
    }

    if (!exists) {
      res.status(422).json({ error: `user "${userId}" not found` });
      return;
    }
    res.status(201).json(store.create(parsed.value));
  });

  app.get("/orders", (_req: Request, res: Response) => {
    res.json(store.list());
  });

  app.get("/orders/:id", (req: Request<{ id: string }>, res: Response) => {
    const order = store.get(req.params.id);
    if (!order) {
      res.status(404).json({ error: "order not found" });
      return;
    }
    res.json(order);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = clientErrorStatus(err);
    if (status === undefined) {
      logger.error(err);
      res.status(500).json({ error: "internal server error" });
      return;
    }
    res.status(status).json({ error: clientErrorMessage(err, status) });
  });

  return app;
}

// The JSON body parser reports bad input as errors carrying a 4xx status.
function clientErrorStatus(err: unknown): number | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  ) {
    return err.status;
  }
  return undefined;
}

function clientErrorMessage(err: unknown, status: number): string {
  if (status === 413) {
    return "request body too large";
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    err.type === "entity.parse.failed"
  ) {
    return "invalid JSON body";
  }
  return "invalid request";
}
