# SF-4 maintainer checklist

## Behavior matrix (adapter-evm-core)

- [ ] All five ops present: deploy, grant, attachClaim, registerIdentity, registerTrustedIssuer
- [ ] Modes include `submitted`, `confirmed`, and explicit `absent` (≥1 on deploy/grant, ≥1 on a passthrough op)
- [ ] Every behavioral row constructs a defect (RED) then real method (GREEN)
- [ ] attach/register GREEN asserts exact `{ id }` and `not.toHaveProperty('completion')`
- [ ] Trusted-issuer: noop sentinel + execute strip only — no invented submit-only branch
- [ ] Disagreement through passthrough still THROWs both directions
- [ ] No cross-import of SF-2/SF-3 deep test modules

## Pack surface (adapter-evm)

- [ ] `npm pack --dry-run --json` lists `dist/*.mjs|cjs`
- [ ] Packed `package/dist` contains:
  - [ ] C-1 `resolveWriteCompletion`
  - [ ] C-2 `WriteCompletionDisagreementError`
  - [ ] C-3 `completion === 'submitted'` (or double-quote form)
  - [ ] C-4 `submit-only early return`
- [ ] Workspace `dist/` marker parity with packed dist
- [ ] Content gate never greps `src/` / `package/src/`
- [ ] C-5: synthetic empty bundle fails marker assert
- [ ] Sibling suite — does not extend SF-5 ENS markers
- [ ] No publish step

## MECHANISM vs CONVENTION (quick)

| MECHANISM | CONVENTION / open |
|-----------|-------------------|
| Matrix NON-VACUITY | `onSubmitted` not re-fired by adapter (SF-1) |
| Exact `{ id }` strip | Nested plugin keys ignored |
| Pack dry-run + dist markers | Residual Risk timeout indistinguishability (named open) |
