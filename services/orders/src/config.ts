export interface Config {
  port: number;
  usersUrl: string;
  usersTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: positiveInt(env, "PORT", 8080),
    usersUrl: baseUrl(env, "USERS_URL", "http://localhost:8081"),
    usersTimeoutMs: positiveInt(env, "USERS_TIMEOUT_MS", 2000),
  };
}

// Bad config fails at start-up rather than on the first request.
function positiveInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

function baseUrl(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const raw = env[name] ?? "";
  const value = raw === "" ? fallback : raw;
  // "localhost:8081" parses as a URL with scheme "localhost:", so checking
  // that it parses is not enough.
  const protocol = URL.parse(value)?.protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`${name} must be an http(s) URL, got "${value}"`);
  }
  // Paths are appended with a leading slash, so drop any trailing one.
  return value.replace(/\/+$/, "");
}
