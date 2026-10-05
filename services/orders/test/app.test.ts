import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createUsersClient } from "../src/usersClient.js";

const USERS_URL = "http://users.test";
const TIMEOUT_MS = 50;

const validOrder = { userId: "1", item: "widget", quantity: 2 };

// The users service is replaced by a stubbed global fetch, so the real
// client code (URL building, timeout, status handling) runs in every test.
function setup(fetchImpl: typeof fetch) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const logger = { error: vi.fn() };
  const app = createApp({
    usersClient: createUsersClient(USERS_URL, TIMEOUT_MS),
    logger,
  });
  return { app, fetchMock, logger };
}

const userFound = () =>
  Promise.resolve(Response.json({ id: "1" }, { status: 200 }));
const userMissing = () =>
  Promise.resolve(Response.json({ error: "user not found" }, { status: 404 }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /orders", () => {
  it("creates an order when the user exists", async () => {
    const { app, fetchMock } = setup(userFound);

    const res = await request(app).post("/orders").send(validOrder);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: "1", ...validOrder });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${USERS_URL}/users/1`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("trims userId and item before storing", async () => {
    const { app, fetchMock } = setup(userFound);

    const res = await request(app)
      .post("/orders")
      .send({ userId: " 1 ", item: " widget ", quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "1",
      userId: "1",
      item: "widget",
      quantity: 1,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${USERS_URL}/users/1`);
  });

  it("encodes the userId in the users service URL", async () => {
    const { app, fetchMock } = setup(userMissing);

    await request(app)
      .post("/orders")
      .send({ ...validOrder, userId: "a/b?c" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${USERS_URL}/users/a%2Fb%3Fc`);
  });

  const badUserId = "userId must be a non-empty string";
  const badItem = "item must be a non-empty string";
  const badQuantity = "quantity must be a positive integer";

  it.each([
    ["missing userId", { item: "widget", quantity: 1 }, badUserId],
    ["empty userId", { ...validOrder, userId: "  " }, badUserId],
    ["numeric userId", { ...validOrder, userId: 1 }, badUserId],
    ["missing item", { userId: "1", quantity: 1 }, badItem],
    ["empty item", { ...validOrder, item: "" }, badItem],
    ["missing quantity", { userId: "1", item: "widget" }, badQuantity],
    ["zero quantity", { ...validOrder, quantity: 0 }, badQuantity],
    ["negative quantity", { ...validOrder, quantity: -3 }, badQuantity],
    ["fractional quantity", { ...validOrder, quantity: 1.5 }, badQuantity],
    ["string quantity", { ...validOrder, quantity: "2" }, badQuantity],
    ["array body", [validOrder], "request body must be a JSON object"],
  ])("rejects %s with 400", async (_name, body, error) => {
    const { app, fetchMock } = setup(userFound);

    const res = await request(app).post("/orders").send(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const { app, fetchMock } = setup(userFound);

    const res = await request(app)
      .post("/orders")
      .set("Content-Type", "application/json")
      .send('{"userId":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid JSON body" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body with 400", async () => {
    const { app } = setup(userFound);

    const res = await request(app)
      .post("/orders")
      .set("Content-Type", "text/plain")
      .send("userId=1");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "request body must be a JSON object" });
  });

  it("rejects an oversized body with 413", async () => {
    const { app } = setup(userFound);

    const res = await request(app)
      .post("/orders")
      .send({ ...validOrder, item: "x".repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "request body too large" });
  });

  it("returns 422 when the user does not exist", async () => {
    const { app } = setup(userMissing);

    const res = await request(app)
      .post("/orders")
      .send({ ...validOrder, userId: "42" });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'user "42" not found' });
    expect((await request(app).get("/orders")).body).toEqual([]);
  });

  it("returns 502 when the users service is unreachable", async () => {
    const { app, logger } = setup(() =>
      Promise.reject(new TypeError("fetch failed")),
    );

    const res = await request(app).post("/orders").send(validOrder);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "users service unavailable" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("fetch failed"),
    );
    expect((await request(app).get("/orders")).body).toEqual([]);
  });

  it("returns 502 when the users service responds with an error", async () => {
    const { app } = setup(() =>
      Promise.resolve(new Response("upstream broke", { status: 503 })),
    );

    const res = await request(app).post("/orders").send(validOrder);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "users service unavailable" });
  });

  it("returns 502 when the users service times out", async () => {
    // Never answers; only settles when the client's timeout signal aborts it.
    const { app, logger } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            reject(signal.reason as Error);
          });
        }),
    );

    const res = await request(app).post("/orders").send(validOrder);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "users service unavailable" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(`timed out after ${String(TIMEOUT_MS)}ms`),
    );
  });
});

describe("GET /orders", () => {
  it("returns an empty list before any order is created", async () => {
    const { app } = setup(userFound);

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns every created order in creation order", async () => {
    const { app } = setup(userFound);
    await request(app).post("/orders").send(validOrder);
    await request(app)
      .post("/orders")
      .send({ ...validOrder, item: "gadget" });

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "1", ...validOrder },
      { id: "2", ...validOrder, item: "gadget" },
    ]);
  });
});

describe("GET /orders/:id", () => {
  it("returns an existing order", async () => {
    const { app } = setup(userFound);
    await request(app).post("/orders").send(validOrder);

    const res = await request(app).get("/orders/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "1", ...validOrder });
  });

  it("returns 404 for an unknown order", async () => {
    const { app } = setup(userFound);

    const res = await request(app).get("/orders/999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "order not found" });
  });
});

describe("unexpected errors", () => {
  it("return a JSON 500 without leaking details", async () => {
    const logger = { error: vi.fn() };
    const app = createApp({
      usersClient: { userExists: () => Promise.reject(new Error("bug")) },
      logger,
    });

    const res = await request(app).post("/orders").send(validOrder);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "internal server error" });
    expect(logger.error).toHaveBeenCalledWith(new Error("bug"));
  });
});

describe("unknown routes", () => {
  it("return a JSON 404", async () => {
    const { app } = setup(userFound);

    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });
});
