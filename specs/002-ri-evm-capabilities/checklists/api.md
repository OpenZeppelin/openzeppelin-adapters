# Capability Contract & Packaging Quality Checklist: RI POC Adapter Capabilities (ERC-3643 / ERC-4626 / IRS)

**Purpose**: Validate that the capability interface-contract and packaging/tier-isolation requirements are complete, clear, consistent, and measurable before implementation (PR-reviewer gate on spec.md + design artifacts).
**Created**: 2026-05-30
**Resolved**: 2026-05-30 — all items reviewed; gaps fixed in `spec.md`. See per-item notes.
**Feature**: [spec.md](../spec.md)

**Note**: These items test the *requirements*, not the implementation. Each asks whether something is adequately specified, not whether code works.

## Requirement Completeness

- [x] CHK001 Are the return-value shapes specified for every read method (not just method names) — including `getJurisdiction`, `balanceOf`, `getOnchainId`, `isVerified`? [Completeness, Spec §FR-006/§FR-007/§FR-008] — RESOLVED: return shapes added inline to FR-006, FR-007, FR-008 (+ FR-008b for `getOnchainId`).
- [x] CHK002 Are the typed error classes enumerated by name, stable `code`, and required structured-detail fields, rather than described only as "typed error classes"? [Completeness, Spec §FR-012] — RESOLVED: new FR-012a enumerates the base class + 8 concrete classes with codes and detail fields.
- [x] CHK003 Is the "documented not-found result" for `getOnchainId` given a concrete shape rather than referenced abstractly? [Completeness, Spec §US2 AS2 / Edge Cases] — RESOLVED: FR-008b defines `{ found: boolean; onchainId? }`, `{ found: false }` on no identity, no throw.
- [x] CHK004 Are the inputs and output of the key-free claim-payload/digest helper specified (fields in, digest out)? [Completeness, Spec §FR-008a] — RESOLVED: FR-008a now specifies `{ onchainId, topic, scheme, data }` → `{ digest, topic, scheme, data }`, no RPC/sign/key.
- [x] CHK005 Is the `OnboardingClaim` shape (`topic`, `scheme`, `data`, `signature`, optional issuer) fully specified for the claim-attachment method? [Completeness, Spec §FR-008a] — SATISFIED: FR-008a lists `topic`, `scheme`, `data`, `signature` + optional issuer identity address (added).
- [x] CHK006 Are the exact sub-path names and the `package.json` `exports` entry shape specified for all three capabilities? [Completeness, Spec §FR-013] — SATISFIED: FR-013 names `/erc3643`, `/erc4626`, `/irs`; the per-capability `exports` shape mirrors the existing access-control pattern documented in `research.md` R7 / `plan.md`.
- [x] CHK007 Are the ABI-provenance fields enumerated (source repo + release tag/commit + contract name) and their recording location specified? [Completeness, Spec §FR-017a] — SATISFIED: FR-017a (added previously) enumerates fields + recording location (ABI module + Changeset) + exact-pin rule.

## Requirement Clarity

- [x] CHK008 Is "base-unit decimal `string`" defined precisely enough to be unambiguous (non-negative? integer base units only? no scientific notation / no decimal point)? [Clarity, Spec §FR-003a] — RESOLVED: FR-003a now defines base-10 integer, non-negative, no sign/point/sci-notation/separators, with example.
- [x] CHK009 Is "idempotent" defined in observable terms for trusted-issuer registration and identity operations (no-op vs. typed error vs. same result on re-run)? [Clarity, Spec §FR-008 / Edge Cases] — RESOLVED: FR-008c defines observable idempotency; `registerTrustedIssuer`/`attachClaim` no-throw, `registerIdentity` re-run → `IdentityAlreadyRegistered`.
- [x] CHK010 Is the optional status-change callback signature specified (status type and details type) consistently with the reused execution contract? [Clarity, Spec §FR-004] — SATISFIED: FR-004 reuses the `AccessControlService` shape; the exact `(status, details) => void` signature is fixed in `contracts/*.md` and the `ExecutionCapability` contract.
- [x] CHK011 Is the distinction between "thrown typed error" and "returned negative result" stated unambiguously for every read/write (e.g., `isVerified`→`false`, `simulateTransfer`→`{allowed:false}`, writes throw)? [Clarity, Spec §FR-012 / Edge Cases] — SATISFIED: FR-012 states the value-vs-throw rule explicitly; Edge Cases reinforce per case.

## Requirement Consistency

- [x] CHK012 Do FR-004 and FR-010a describe the same write-execution contract without conflict (ExecutionConfig acceptance vs. injected `signAndBroadcast` factory shape)? [Consistency, Spec §FR-004/§FR-010a] — SATISFIED: no conflict — FR-004 is the interface-method layer (accepts `ExecutionConfig`), FR-010a is the factory layer (injected `signAndBroadcast`); they are complementary.
- [x] CHK013 Is the amount-as-`string` rule applied consistently to ALL amount-bearing returns, including `sharesIssued` / `amountReturned` on vault writes? [Consistency, Spec §FR-003a/§FR-007] — RESOLVED: FR-007 now explicitly requires write-result shares/assets amounts to be base-unit `string`.
- [x] CHK014 Is the Tier classification internally consistent — FR-002 says "Tier 3" while also describing "Tier-2-style reads"? Is the single-interface/highest-tier rule stated so it cannot be read as two tiers? [Consistency, Spec §FR-002] — RESOLVED: FR-002 now states each is a single capability at its highest tier (Tier 3), not two capabilities/entries.
- [x] CHK015 Is "jurisdiction" represented consistently across capabilities (e.g., `getJurisdiction` string vs. `registerIdentity` numeric `country`)? Is the relationship between the two defined? [Consistency/Ambiguity, Spec §FR-006/§FR-008, data-model.md] — RESOLVED: FR-008 now states the numeric `country` given to `registerIdentity` is the value `getJurisdiction` reads back as a jurisdiction code.

## Acceptance Criteria Quality (Measurability)

- [x] CHK016 Does the method count asserted in SC-004 match exactly the methods enumerated in FR-006/FR-007/FR-008? [Measurability, Spec §SC-004] — RESOLVED: SC-004's IRS list was missing deploy-ONCHAINID and trusted-issuer registration; now lists 4 writes + 3 reads, matching FR-008.
- [x] CHK017 Is "no React/Wagmi in the import graph" tied to an objective verification method (which tool / which built entry analyzed)? [Measurability, Spec §SC-003/§FR-015] — SATISFIED: SC-003 specifies import-graph analysis of the built sub-path entries.
- [x] CHK018 Is SC-008 ("stable enough … without further interface changes") expressed as something objectively checkable, or is it inherently subjective? [Measurability, Spec §SC-008] — SATISFIED: framed as an observable proxy (plugin team consumes published/pre-release types without requesting interface reshaping during Week 1); accepted as-is.

## Edge Case & Scenario Coverage

- [x] CHK019 Are requirements defined for invalid `Amount` inputs (negative, non-numeric, fractional base units) at the interface boundary? [Edge Case, Gap] — RESOLVED: FR-003a mandates rejection with a typed error pre-submission; reinforced by a new "Malformed amount input" edge case.
- [x] CHK020 Is the behavior for an UNmapped on-chain revert specified (which error type, what context is preserved)? [Coverage, Spec §FR-012 / Edge Cases] — RESOLVED: FR-012a names `RICapabilityOperationFailed` (`OPERATION_FAILED`, `operation`/`cause?`) as the unmapped-revert fallback, never silently swallowed.
- [x] CHK021 Are post-`dispose()` method-call requirements defined beyond a reference to "the adapter's standard disposed-runtime contract"? [Coverage, Spec §FR-016 / Edge Cases] — SATISFIED (by design): intentionally reuses the existing documented disposed-runtime contract (`guardRuntimeCapability`) rather than re-specifying it — consistent with the reuse-first constitution; not a gap.

## Dependencies & Assumptions

- [x] CHK022 Is the FR-018 submit-then-poll design check framed to produce a recorded outcome (confirmed or documented gap), and is that outcome actually captured? [Assumption, Spec §FR-018, research.md R6] — SATISFIED: FR-018 requires a recorded outcome; `research.md` R6 records "CONFIRMED" (now cross-referenced from FR-018).
- [x] CHK023 Does the spec reconcile the naming tension between `AdapterExecutionStrategy` (per §US6/§Key Entities) and `ExecutionCapability.signAndBroadcast` / `waitForTransactionConfirmation` (where the async methods actually live)? [Conflict, Spec §US6/§FR-018, research.md R6] — RESOLVED: FR-018, US6 (description + Independent Test + AS1), and the Key Entities entry now attribute `signAndBroadcast`/`waitForTransactionConfirmation` to `ExecutionCapability` (injected-callback shape), distinguishing the wallet-bound `AdapterExecutionStrategy.execute`.
- [x] CHK024 Is the cross-repo ordering constraint (publish `@openzeppelin/ui-types` before adapters) stated as a hard, gating dependency rather than a preference? [Dependency, Spec §FR-022] — SATISFIED: FR-022 states it as a MUST.

## Notes

- All 24 items resolved on 2026-05-30. 13 items required `spec.md` edits (CHK001–004, 008, 009, 013, 014, 015, 016, 019, 020, 023); the remainder were already satisfied (with one — CHK021 — a deliberate reuse-by-reference rather than a gap).
- Spec changes added: FR-008b, FR-008c, FR-012a; tightened FR-002, FR-003a, FR-006, FR-007, FR-008, FR-008a, FR-012, FR-018, SC-004; reconciled US6 and the Key Entities execution entry; added a malformed-amount edge case.
- Highest-risk items (now closed): CHK002 (error-class enumeration), CHK008 (amount format), CHK015/CHK023 (cross-artifact naming/consistency).
