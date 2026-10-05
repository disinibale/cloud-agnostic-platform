import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      port: 8080,
      usersUrl: "http://localhost:8081",
      usersTimeoutMs: 2000,
    });
  });

  it("treats empty values as unset", () => {
    expect(
      loadConfig({ PORT: "", USERS_URL: "", USERS_TIMEOUT_MS: "" }),
    ).toEqual(loadConfig({}));
  });

  it("reads overrides from the environment", () => {
    expect(
      loadConfig({
        PORT: "9000",
        USERS_URL: "http://users.internal:8081/",
        USERS_TIMEOUT_MS: "500",
      }),
    ).toEqual({
      port: 9000,
      usersUrl: "http://users.internal:8081",
      usersTimeoutMs: 500,
    });
  });

  it.each([
    ["PORT", "abc"],
    ["PORT", "0"],
    ["PORT", "80.5"],
    ["USERS_TIMEOUT_MS", "-1"],
    ["USERS_TIMEOUT_MS", "soon"],
  ])("rejects %s=%s", (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(name);
  });

  it.each(["localhost:8081", "users:8081", "/users", "ftp://users.test"])(
    "rejects USERS_URL=%s",
    (value) => {
      expect(() => loadConfig({ USERS_URL: value })).toThrow("USERS_URL");
    },
  );

  it("accepts an https USERS_URL", () => {
    expect(loadConfig({ USERS_URL: "https://users.test" }).usersUrl).toBe(
      "https://users.test",
    );
  });
});
