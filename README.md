# cloud-agnostic-platform

A language-agnostic, cloud-agnostic platform engineering lab. The platform is the product: any service that follows the [service contract](docs/service-contract.md) should deploy onto it with no platform changes, whatever language it is written in. Three deliberately trivial services in Go, Node.js and Python are the workloads that prove it. They exist to be deployed, observed and broken.

## Status

| Phase | Scope                                                                                                                  | Status  |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| 0     | Scaffold: three trivial services with tests, a root Makefile, the service contract as a document, ADRs                | Done    |
| 1     | Foundation platform: container images, Kubernetes on kind, CI, and the service contract implemented in every service | Planned |
| 2     | Observability and SLOs: metrics, logs and dashboards, SLOs with alerting                                               | Planned |
| 3     | GitOps: Argo CD deploys the platform and services from this repository                                                | Planned |
| 4     | Reliability engineering: chaos experiments, load tests, runbooks, postmortems                                          | Planned |
| 5     | Terraform and cloud: the same platform on managed cloud infrastructure                                                 | Planned |

Today everything runs as local processes. Nothing in Phases 1 to 5 exists yet.

## Services

| Service                      | Language                                   | Runs as                                      |
| ---------------------------- | ------------------------------------------ | -------------------------------------------- |
| [`users`](services/users)    | Go, standard library only                  | HTTP on `:8081`, in-memory users             |
| [`orders`](services/orders)  | Node.js, TypeScript, Express 5             | HTTP on `:8080`, in-memory orders, calls `users` |
| [`worker`](services/worker)  | Python                                     | Reads order events from stdin, writes results to stdout |

## Prerequisites

| Tool     | Version                         | Notes                                                                                                                                                                  |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GNU Make | 4.x                             | The Makefiles use a POSIX shell. On Windows, run `make` from Git Bash.                                                                                                 |
| Go       | 1.21 or newer                   | `go.mod` pins Go 1.27.1. Go downloads that toolchain automatically unless `GOTOOLCHAIN` is set to `local`.                                                              |
| Node.js  | 24 (LTS), with Corepack         | Corepack runs pnpm 12.9.1, pinned in `package.json`. pnpm then downloads and uses Node.js 24.21.0 for every script, pinned through `devEngines`. Node.js 25 and later no longer bundle Corepack; install it with `npm install -g corepack`. |
| uv       | 0.12.23                         | Pinned in `pyproject.toml`. uv installs Python 3.14.8, pinned in `.python-version`.                                                                                    |

Dependencies are pinned to exact versions and locked: `pnpm-lock.yaml` for `orders`, `uv.lock` for `worker`. `users` has no dependencies.

## Quickstart

```bash
make install   # toolchains and dependencies for all three services
make lint      # go vet + gofmt, ESLint + Prettier + tsc, ruff
make test      # go test, Vitest, pytest
```

Start `users`, then `orders`, each in its own terminal:

```bash
make run-users
```

```bash
make run-orders
```

Then, from a third terminal (the examples use `curl` in a POSIX shell such as Git Bash):

```bash
# users
curl -s localhost:8081/users
curl -s localhost:8081/users/1
curl -s -X POST localhost:8081/users -H 'Content-Type: application/json' \
  -d '{"name":"Dave","email":"dave@example.com"}'

# orders: each POST checks the user exists by calling the users service
curl -s -X POST localhost:8080/orders -H 'Content-Type: application/json' \
  -d '{"userId":"1","item":"widget","quantity":2}'
curl -s localhost:8080/orders
curl -s localhost:8080/orders/1

# an unknown user is rejected with 422
curl -s -i -X POST localhost:8080/orders -H 'Content-Type: application/json' \
  -d '{"userId":"999","item":"widget","quantity":1}'
```

The first order returns `{"id":"1","userId":"1","item":"widget","quantity":2}` with status `201`. With `users` stopped, the same request returns `502` and `{"error":"users service unavailable"}`.

The worker reads one JSON event per line from stdin:

```bash
printf '%s\n' \
  '{"orderId":"o-1","userId":"1","item":"widget","quantity":2}' \
  '{"orderId":"o-2","userId":"1","item":"spaceship","quantity":1}' \
  'not json' \
  | make run-worker
```

It writes one result per event to stdout and logs to stderr:

```
{"orderId": "o-1", "status": "processed"}
{"orderId": "o-2", "status": "rejected", "reason": "unknown item: spaceship"}
{"orderId": null, "status": "rejected", "reason": "malformed JSON"}
```

## Service reference

### `users`

| Method and path    | Response                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- |
| `GET /users`       | `200` with every user                                                              |
| `GET /users/{id}`  | `200` with the user, or `404`                                                      |
| `POST /users`      | `201` with the new user; `400` if `name` or `email` is missing or the body is not valid JSON; `413` over 1 MiB |

Unknown paths return `404` and unsupported methods return `405` with an `Allow` header. Every error has a JSON body such as `{"error":"not found"}`.

Starts with three users: Alice, Bob and Carol, all at `example.com`.

| Variable | Default | Purpose          |
| -------- | ------- | ---------------- |
| `PORT`   | `8081`  | Port to listen on |

### `orders`

| Method and path    | Response                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /orders`     | Body `{"userId": string, "item": string, "quantity": positive integer}`. `201` with the order; `400` invalid body; `413` over 100 KiB; `422` user does not exist; `502` users service unreachable, timed out or failing |
| `GET /orders`      | `200` with every order                                                                                                        |
| `GET /orders/{id}` | `200` with the order, or `404`                                                                                                |

| Variable           | Default                 | Purpose                                         |
| ------------------ | ----------------------- | ----------------------------------------------- |
| `PORT`             | `8080`                  | Port to listen on                               |
| `USERS_URL`        | `http://localhost:8081` | Base URL of the users service                   |
| `USERS_TIMEOUT_MS` | `2000`                  | Timeout for each call to the users service, in ms |

Invalid values stop the service at start-up. `make -C services/orders build` compiles to `dist/`, which `pnpm start` runs.

### `worker`

Input, one per line: `{"orderId": str, "userId": str, "item": str, "quantity": int}`. Output, one per input line: `{"orderId": str | null, "status": "processed" | "rejected", "reason"?: str}`.

- Known items are `widget`, `gadget` and `gizmo`. A processed event logs the order total from a fixed price table.
- Malformed JSON, invalid fields and unknown items are rejected with a `reason`, and the worker carries on. `orderId` is `null` when it is missing or invalid.
- Blank lines are skipped.

There is no queue yet. Event processing (`worker/processing.py`) is separate from the stdin entrypoint (`worker/__main__.py`), so the source can change without touching the processing.

## Make targets

| Target                                                   | Does                                         |
| -------------------------------------------------------- | -------------------------------------------- |
| `make help`                                              | Lists targets (default)                      |
| `make install`                                           | Installs dependencies for every service      |
| `make lint`                                              | Lints every service; fails if any fail       |
| `make test`                                              | Tests every service; fails if any fail       |
| `make fmt`                                               | Formats the code of every service            |
| `make run-users` / `make run-orders` / `make run-worker` | Runs one service locally                     |

Each service has its own Makefile with the same targets, for example `make -C services/worker test`.

## Repository layout

```
services/
  users/      Go users service
  orders/     Node.js + TypeScript orders service
  worker/     Python worker
docs/
  service-contract.md   rules every service follows (target contract, implemented in Phase 1)
  adr/                  architecture decision records
IDEAS.md      parked ideas
Makefile      single entry point
```

## Documentation

- [Service contract](docs/service-contract.md): health endpoints, metrics, logs and shutdown behaviour every service will implement.
- [ADR 0001](docs/adr/0001-language-agnostic-platform.md): why the platform is defined by a contract rather than a language or framework.

## License

[MIT](LICENSE)
