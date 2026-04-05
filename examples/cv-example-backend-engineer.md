# CV -- Jordan Rivera

**Location:** Berlin, Germany
**Email:** jordan@example.com
**LinkedIn:** linkedin.com/in/jordanrivera
**Portfolio:** jordanrivera.dev
**GitHub:** github.com/jordanrivera

## Professional Summary

Backend engineer with 7 years designing and operating high-throughput services. Owned core payment and ledger APIs at a growth-stage marketplace (2019-2024), cutting p99 latency by 40% and hardening reliability to 99.95% monthly availability. Strong in Go and PostgreSQL, event-driven architecture, and pragmatic observability.

## Work Experience

### MarketHub GmbH -- Berlin, Germany
**Staff Backend Engineer**
2019-2024

- Led redesign of order and payment APIs (Go, gRPC): idempotency, outbox pattern, and saga-style compensations for partial failures
- Migrated monolithic checkout path to event-driven flow (Kafka): reduced blast radius during incidents and improved deploy frequency from weekly to daily
- Drove database work: partitioning hot tables, read replicas for reporting, and migration playbook with zero-downtime cutovers
- Introduced SLOs, error budgets, and on-call runbooks; cut incident MTTR by roughly half through better dashboards and tracing (OpenTelemetry)
- Mentored 4 engineers on API design, testing strategy, and production debugging

### CloudScale Ltd -- Remote
**Backend Engineer**
2016-2019

- Built REST and internal admin APIs (Node.js → later Go) for a multi-tenant SaaS product
- Implemented caching layer (Redis) and rate limiting; supported 10x traffic growth without linear cost increase
- Participated in on-call rotation and postmortems; contributed to CI pipeline and staging parity improvements

## Projects

- **ledger-kit** (Open Source) -- Small library for double-entry ledger invariants and test fixtures. Used in workshops on financial correctness
- **trace-cookbook** (Blog series) -- Practical patterns for correlating logs, metrics, and traces in Go services

## Education

- BS Software Engineering, TU Berlin (2016)

## Skills

- **Backend:** Go, Node.js (TypeScript), REST, gRPC, GraphQL (consumption)
- **Data:** PostgreSQL, Redis, Kafka, Elasticsearch basics
- **Ops:** Kubernetes, Docker, Terraform, GitHub Actions, Prometheus, Grafana
- **Practices:** DDD boundaries, testing (unit/integration/contract), SRE-style on-call
