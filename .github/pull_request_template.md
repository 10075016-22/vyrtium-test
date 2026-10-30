## Summary

<!-- What does this PR change and why? -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Tests
- [ ] Docs / chore

## Scope

- [ ] API (`apps/api`)
- [ ] Web (`apps/web`)
- [ ] CI / tooling

## Money safety checklist

<!-- Only for changes that touch balances, transactions, idempotency or the webhook. -->

- [ ] Amounts are handled as integer cents (no `Number` / `parseFloat` on money)
- [ ] Balance and transaction writes happen in the same DB transaction
- [ ] Idempotency is enforced by DB constraints, not read-then-insert
- [ ] Tests cover retries, concurrency or duplicates where relevant

## How to test

<!-- Steps, commands or curl requests a reviewer can run. -->

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:coverage` passes (coverage >= 90%)
- [ ] README updated if behavior or setup changed
