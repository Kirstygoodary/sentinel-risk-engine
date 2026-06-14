# Adaptive Transaction Risk Engine

[![CI](https://github.com/<your-username>/<repo-name>/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-username>/<repo-name>/actions/workflows/ci.yml)

> Real-time, multi-signal fraud/risk scoring with **graduated, reversible
> enforcement** (adaptive escrow). A clean-room reference implementation in
> TypeScript / NestJS.

*This is a clean-room reimplementation of a fraud/risk architecture I designed
and shipped in a previous role. It was rebuilt from scratch — from architectural
principles, not source — using no prior-employer code, data, or proprietary
parameters. All thresholds and model constants here are re-derived and tuned on
synthetic data. It's deliberately kept domain-agnostic (generic "transactions"
and "accounts") to demonstrate the engineering without reproducing any specific
product.*

---

## The problem

When money moves on a delay-settled platform — a marketplace payout, a creator
withdrawal, a merchant settlement — you can't yet know if the underlying payment
is fraudulent. A chargeback can arrive **months** later. Pay out immediately and
you eat the loss; hold everyone's money "just in case" and you punish the honest
majority with friction.

This engine's answer: **score each transaction from several independent signals,
then apply a hold whose length scales with risk** — short for clean activity,
long enough on risky activity that a chargeback almost always lands *before* the
funds are released (so the hold can be cancelled instead of paying out fraud).
Accounts that prove themselves clear faster over time; accounts that rack up
realized losses are paused.

## Architecture

```
Transaction ─► [ Signal collection ]
        ┌────────────┬──────────────┬───────────────┐
        ▼            ▼              ▼               ▼
   [ ML signal ] [ Outlier ]  [ Bayesian ]   [ Guardrail ]
   (3rd-party    (MAD vs the   (per-account   (late-loss
    verdict)     account's     risk from      hard tripwire)
                 own history)  its history)
        └────────────┴──────────────┴───────────────┘
                     ▼
            [ Decision engine ]   pure fn, override-ordered:
                     │             guardrail > auto-pause > max(others)
                     ▼
         Risk tier: CLEAR · WATCH · T1 · T2 · T3
                     ▼
        [ Adaptive escrow ]   tier → hold duration → scheduled release;
                     │         auto-pause repeat offenders; reverse on loss
                     ▼
        [ Double-entry ledger ]   every movement auditable + reversible
```

### Design decisions (the rationale — each is a deliberate trade-off)

- **Statistics for detection, not an LLM.** Scoring is deterministic and
  auditable — essential when the output moves money and has to be explained in a
  dispute. The ML signal is an *inbound* third-party verdict we fold in, not
  something guessed by a model at decision time.
- **MAD, not mean/standard-deviation, for outlier detection.** Median Absolute
  Deviation is robust to outliers — and fraud *is* the outlier, so the baseline
  must not be dragged by it. The MAD floor is **proportionate to the account's
  own median spend**, so a steady high-value account isn't hypersensitive to
  tiny wobbles.
- **Act on patterns, not single events.** A lone chargeback can be a legitimate
  dispute (faulty goods, buyer-side "friendly fraud"). The Bayesian layer does
  not penalise a single isolated chargeback; the guardrail requires *both*
  material realized losses *and* a late-chargeback pattern before it trips.
- **Trust is capped.** Cleared volume lowers an account's risk — but with a cap,
  so a fraudster can't wash a bad history by flooding the system with small clean
  orders.
- **Graduated and reversible.** Severity scales with risk, and every action is
  undoable: a reversal is an equal-and-opposite ledger posting, never a
  destructive edit.
- **Shadow mode first.** `RISK_SHADOW_MODE=true` (the default) scores everything
  and records the verdict, but moves no money. This is the honest cold-start
  posture: calibrate against real outcomes before enforcing, so you don't
  false-pause real accounts on day one.
- **Explainable by default.** Every verdict carries a creator-safe
  `humanReason`; raw scores and internal codes never leak to the account holder.
- **Money as a double-entry ledger, not a balance column.** Balances are derived
  by summing entries, so every figure is provable and every movement auditable.

### The four signals

| Signal | Detects | Technique |
|---|---|---|
| **ML** | Risk on this specific transaction | Maps a 3rd-party verdict (NONE/LOW/MEDIUM/HIGH) → tier |
| **Outlier** | Value abnormal vs the account's *own* history | Median Absolute Deviation; cold-start guard (min history); proportionate floor |
| **Bayesian** | How risky the account is, given its full history | Log-odds update: chargebacks raise risk, capped cleared-volume "trust" lowers it; auto-pause threshold |
| **Guardrail** | Active, realized losses slipping past holds | Hard tripwire: fires only on material realized loss **and** a late-chargeback pattern |

> All thresholds/priors are re-derived from first principles and tuned on
> synthetic data — not lifted from any prior system.

## See it work

```bash
pnpm install
cp .env.example .env
pnpm db:up               # Postgres via Docker (host port 5433)
pnpm prisma:migrate      # apply schema
RISK_SHADOW_MODE=false pnpm seed   # enforce mode, so verdicts/pauses fire
```

The seed walks five accounts, each exercising a different signal, and prints the
engine's verdict for a fresh transaction on each:

```
  ▸ Steady clean account
      verdict : CLEAR  (source: DEFAULT)
  ▸ Sudden high-value outlier
      verdict : T3  (source: OUTLIER)
  ▸ Repeat chargeback pattern
      verdict : WATCH  (source: BAYESIAN)
  ▸ High ML risk on the transaction
      verdict : T3  (source: ML)
  ▸ Late-loss guardrail tripped
      verdict : T3  (source: GUARDRAIL, AUTO-PAUSE)
```

## Tests

```bash
pnpm test     # 38 unit tests across 7 suites
```

Coverage is concentrated where correctness matters most:
- **Decision engine** — each override rule (guardrail wins; auto-pause beats a
  higher tier; max-tier otherwise; clear by default; no raw score leaks).
- **Each scorer** — including the edge cases: MAD robustness to a single spike,
  divide-by-zero on constant history, the "single chargeback isn't penalised"
  rule, the trust cap, the guardrail's both-conditions requirement.
- **Ledger** — refuses an unbalanced posting; derives balances correctly.
- **Escrow** — shadow mode moves no money; a matured hold is **not** released
  while the account is paused; release/reverse behave and are idempotent.

The DB-touching layers (ledger, escrow) mock Prisma so the full suite runs in CI
without a database.

## Tech

- **Stack:** TypeScript, NestJS (module → service → repository), PostgreSQL + Prisma.
- NestJS is structurally Spring-for-Node — dependency injection, modules,
  decorators, guards/interceptors — so these patterns map directly to Java/Spring.
- The scoring core (`src/risk-engine/scorers/*`, `decide-tier.ts`) is pure and
  framework-free, so it's testable in isolation and portable.

## How I'd take this to production

- **Async scoring.** Today scoring is synchronous in the request path; at scale
  it becomes a `transaction.created → scored → action` event stream (e.g. Kafka),
  with idempotency keys on the money path.
- **Recompute on new evidence.** Account-level signals (Bayesian, guardrail)
  should recompute when a chargeback/refund webhook arrives, not only at
  transaction time — and lift pauses automatically once an account rehabilitates.
- **Observability.** Per-signal firing rates, tier distribution, and
  shadow-vs-enforce divergence as first-class metrics — the calibration dashboard
  is how you decide it's safe to leave shadow mode.

## Known limitations

- Constants are tuned on synthetic, not real, data — production needs calibration
  against a labelled outcome stream.
- Scoring is synchronous (see "to production" above).
- No device/identity-fingerprint signal: a naive exact-match version is too
  false-positive-prone to be useful; doing it properly needs a rarity-weighted
  similarity model, which is out of scope here.
