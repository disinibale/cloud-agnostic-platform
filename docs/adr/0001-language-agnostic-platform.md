# 0001: Define the platform by a contract, not a language or framework

- Status: Accepted
- Date: 2026-10-05

## Context

This repository is a platform engineering lab. The platform (container images, Kubernetes, CI, observability, GitOps, cloud infrastructure) is the product. The services exist only to be deployed, observed and broken.

A platform built around one stack tends to absorb that stack's assumptions without anyone noticing: a health check wired to a framework's middleware, dashboards built on metric names one client library happens to emit, build steps that only know one package manager. Each assumption is small. Together they mean the next service in a different language either cannot be deployed or needs platform changes first.

Real platforms rarely host a single language, so a platform that only works for one is a weak foundation.

Options considered:

1. **One language, one shared framework or library** that provides health checks, metrics and logging. Quick to start, but it ties the platform to that language. Supporting another language later means porting the library and keeping the copies in step.
2. **Leave each service to its own conventions** and adapt the platform per service. No upfront design, but every new service means platform work, and dashboards and alerts can't be shared.
3. **A written contract** for how any service talks to the platform: configuration, health endpoints, metric and label names, log fields, shutdown behaviour. Services implement it in whatever way is idiomatic for their language.

## Decision

We will define the platform by a contract (`docs/service-contract.md`) rather than by a language or framework. Platform components depend only on that contract, never on how a service is built.

We will run three services in three languages to prove it: Go (standard library only), Node.js with TypeScript and Express, and Python. They cover a compiled static binary, an event-loop runtime and an interpreter, plus an HTTP service and a non-HTTP worker. One language proves nothing about agnosticism, and two can share an assumption by accident. Three different ones make hidden coupling much harder to miss.

If a platform change ever needs a language-specific branch, the contract is incomplete. We fix the contract and every service, not the platform.

## Consequences

- A new service in any language can join by implementing the contract, with no platform changes.
- Dashboards, alerts and SLOs are written once against agreed metric names and labels.
- The contract is a short document that is easy to review, and is the single place where rules change.
- Each service implements the contract by hand, so there are three implementations to keep consistent. The rule is to change the contract first, then all three services together.
- The contract can only require what every language can deliver. Features one ecosystem gets for free, such as a particular auto-instrumentation library, cannot be relied on.
- Three toolchains have to be installed, pinned and kept up to date, locally and in CI.
