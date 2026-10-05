# Service contract

**Status: target contract, implemented in Phase 1.** No service implements it yet.

Every service on the platform follows these rules, whatever its language. The platform depends only on this contract, so a service that meets it deploys with no platform changes. This document is the source of truth: change it first, then every service.

## 1. Configuration

- All configuration comes from environment variables. No config files are required to start.
- `PORT` is the port the service listens on. Every service honours it.
- Invalid configuration makes the service exit non-zero at start-up, logging which variable is wrong.

## 2. Health endpoints

| Endpoint       | Purpose   | `200` when                                                                      | Otherwise |
| -------------- | --------- | ------------------------------------------------------------------------------- | --------- |
| `GET /healthz` | Liveness  | The process is running. No dependency checks.                                   | n/a       |
| `GET /readyz`  | Readiness | Start-up is complete and every required dependency is reachable.                | `503`     |

- Bodies are JSON: `{"status":"ok"}`, `{"status":"ready"}`, or `{"status":"not ready","reason":"<why>"}` with the `503`.
- Liveness never checks dependencies. A dependency outage must not restart healthy processes.
- Readiness checks use their own timeout of at most 1 second, so a slow dependency cannot hang the probe.

## 3. Metrics

`GET /metrics` returns the Prometheus text exposition format.

### HTTP services

| Metric                          | Type      | Labels                     |
| ------------------------------- | --------- | -------------------------- |
| `http_requests_total`           | counter   | `method`, `route`, `status` |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status` |

- `method`: upper-case HTTP method, such as `GET`.
- `route`: the route template, never the raw path. Written as `/users/{id}` in every language (Express's `:id` becomes `{id}`). Requests that match no route use `unmatched`. This keeps label cardinality bounded.
- `status`: the response status code as a string, such as `"502"`.
- Duration runs from receiving the request to writing the response.
- Requests to `/healthz`, `/readyz` and `/metrics` are not recorded, so probe traffic does not skew the numbers.
- An **error** is a `5xx` response. `4xx` responses are the client's fault and do not count against the service.

### Workers

| Metric                          | Type      | Labels    |
| ------------------------------- | --------- | --------- |
| `worker_events_total`           | counter   | `outcome` |
| `worker_event_duration_seconds` | histogram | `outcome` |

- `outcome` is one of `processed` (success), `rejected` (invalid input, like a `4xx`) or `failed` (the worker's own fault, like a `5xx`).
- An **error** is `outcome="failed"`.

### Rules for every service

- Histogram buckets, in seconds, are exactly `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`. Client library defaults differ between languages, so they are set explicitly.
- No `service` label. Prometheus attaches target labels (`job`, `namespace`, `pod`) when it scrapes.
- Default runtime and process metrics from the client library are allowed but are not part of the contract.

## 4. Logs

One JSON object per line on stdout. A process whose stdout is its data output (such as the stdin worker) writes logs to stderr instead.

| Field      | Type   | Value                                                                                                           |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `ts`       | string | RFC 3339 timestamp in UTC with milliseconds: `2026-01-31T12:00:00.000Z`                                          |
| `level`    | string | `debug`, `info`, `warn` or `error`, lower-case                                                                   |
| `msg`      | string | What happened. Fixed text per log statement; variable data goes in other fields                                 |
| `service`  | string | The service name: `users`, `orders` or `worker`                                                                  |
| `trace_id` | string | 32 lower-case hex characters (W3C Trace Context). Required on lines about a request or event, omitted otherwise |

- `trace_id` comes from the incoming `traceparent` header when it is present and valid; otherwise the service generates one. Outbound HTTP calls send a `traceparent` header carrying it.
- Extra fields are allowed and use `snake_case`. An error's message goes in an `error` field.
- Secrets, credentials and full request bodies are never logged.

## 5. Shutdown

On `SIGTERM` (and `SIGINT`, for local runs) the service:

1. Makes `/readyz` return `503` so traffic stops being routed to it.
2. Stops accepting new work: closes its listener, or stops taking new events.
3. Finishes in-flight requests or events.
4. Exits `0` once done, within the grace period.

The grace period is `SHUTDOWN_TIMEOUT_SECONDS`, default `20`, which leaves headroom under Kubernetes' default `terminationGracePeriodSeconds` of 30. If work is still running when it expires, the service logs that and exits `1`.

## 6. Workers

Services without business HTTP traffic still listen on `PORT` and serve `/healthz`, `/readyz` and `/metrics` there. The platform then probes and scrapes every service the same way.
