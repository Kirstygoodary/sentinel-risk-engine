# Adaptive Transaction Risk Engine

[![CI](https://github.com/[fill: your-gh-username]/[fill: repo-name]/actions/workflows/ci.yml/badge.svg)](https://github.com/[fill: your-gh-username]/[fill: repo-name]/actions/workflows/ci.yml)

> Real-time, multi-signal fraud/risk scoring with **graduated, reversible
> enforcement** (adaptive escrow). A clean-room reference implementation in
> TypeScript / NestJS.

*This is a clean-room reimplementation of a fraud/risk architecture I designed
and shipped in a previous role. It was rebuilt from scratch — from architectural
principles, not source — using no prior-employer code, data, or proprietary
parameters. All thresholds and model constants are re-derived and tuned on
synthetic data. It's deliberately kept domain-agnostic (generic "transactions"
and "accounts") to demonstrate the engineering without reproducing any specific
product.*

---

## The problem

`[fill: 2-3 sentences in your own words. The core tension: when money moves
(a settlement, a payout, a withdrawal) you can't yet know if it's fraudulent —
the chargeback arrives days later. Pay out immediately → eat the fraud. Hold
everything → punish good customers and add friction.]`

**The approach here:** score each transaction from multiple independent signals,
then apply a *graduated, reversible* hold whose length scales with risk — and
that lifts automatically as an account proves itself.

## Architecture

```
Transaction ─► [ Signal collection ]
        ┌────────────┬──────────────┬───────────────┐
        ▼            ▼              ▼               ▼
   [ ML signal ] [ Outlier ]  [ Bayesian ]   [ Guardrail ]
                  (MAD vs the   (per-account   (late-loss
                  account's     risk from      hard tripwire)
                  own history)  its history)
        └────────────┴──────────────┴───────────────┘
                     ▼
            [ Decision engine ]  pure fn, override-ordered:
                     │            guardrail > auto-pause > max(others)
                     ▼
         Risk tier: CLEAR · WATCH · T1 · T2 · T3
                     ▼
        [ Adaptive escrow ]  tier → hold duration → scheduled release;
                     │        auto-pause repeat offenders; rehab-lift on trust
                     ▼
              [ Double-entry ledger ]  every movement auditable + reversible
```

### Design decisions (the rationale — be ready to defend each)
- **Shadow mode first.** `[fill: scores everything, acts on nothing until
  calibrated. Why: honest cold-start, no false pauses on day one.]`
- **Graduated + reversible.** `[fill: severity scales with risk; every action
  undoable. Why this is the right posture for fraud + compliance.]`
- **Explainable by default.** `[fill: every verdict carries a human-readable
  reason; raw scores never leak. Why: disputes, audits, trust.]`
- **Statistics for detection (not an LLM).** `[fill: scoring is deterministic
  and auditable. Knowing what NOT to put an LLM on is the point.]`
- **Money as a double-entry ledger, not a balance column.** `[fill: why —
  auditability, reversibility, provable figures.]`

### The four signals
| Signal | Detects | Technique |
|---|---|---|
| ML | 3rd-party verdict on the transaction | `[fill]` |
| Outlier | Value abnormal vs the account's *own* history | Median Absolute Deviation `[fill: floor, window]` |
| Bayesian | Account risk given its full history | `[fill: posterior; trust accrues with proven clean volume]` |
| Guardrail | Late-arriving losses | `[fill: realized-loss threshold + late-CB count]` |

> ⚠️ Every threshold/prior here is re-derived from first principles and tuned on
> synthetic data — not lifted from any prior system.

## Tech

- **Stack:** TypeScript, NestJS (controller → service → repository), PostgreSQL + Prisma.
- NestJS is structurally Spring-for-Node — DI, modules, guards/interceptors,
  decorators — so the patterns map directly to Java/Spring.
- `[fill: OPTIONAL but high-value for a staff role — a "how I'd scale this"
  paragraph: async scored-event stream (Kafka) instead of sync scoring,
  idempotency on the money path, real-time vs batch, observability
  (Datadog/Grafana), the consistency model for holds/releases. Prose is fine;
  it shows distributed-systems judgement.]`

## Running it

```bash
pnpm install
cp .env.example .env
pnpm db:up               # Postgres via Docker (host port 5433)
pnpm prisma:migrate      # apply schema
pnpm seed                # synthetic accounts + transactions
pnpm start:dev           # http://localhost:3000/api
pnpm test                # unit tests (the decision engine + ledger invariants)
```

`[fill: once built, add a 3-line "happy path" — e.g. POST a transaction, show the
JSON verdict + the resulting hold. This is what a reviewer reads even if they
never run it.]`

## Tests

`[fill: what's covered. Lead with the decision-engine rules (pure-function tests)
and the ledger double-entry invariant (debits == credits) — those are the
correctness signals that matter for money/fraud code.]`

## What I'd do next / known limitations

`[fill: honesty = seniority. e.g. scoring is synchronous (prod → async event
stream); constants tuned on synthetic not real data; no device-fingerprint layer
(deferred — needs a rarity-weighted similarity model to be meaningful, not a
blunt exact-match).]`
