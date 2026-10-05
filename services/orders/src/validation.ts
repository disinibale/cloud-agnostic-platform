import type { NewOrder } from "./store.js";

export type ParseResult =
  { ok: true; value: NewOrder } | { ok: false; error: string };

export function parseNewOrder(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const { userId, item, quantity } = body as Record<string, unknown>;

  if (typeof userId !== "string" || userId.trim() === "") {
    return { ok: false, error: "userId must be a non-empty string" };
  }
  if (typeof item !== "string" || item.trim() === "") {
    return { ok: false, error: "item must be a non-empty string" };
  }
  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    return { ok: false, error: "quantity must be a positive integer" };
  }

  return {
    ok: true,
    value: { userId: userId.trim(), item: item.trim(), quantity },
  };
}
