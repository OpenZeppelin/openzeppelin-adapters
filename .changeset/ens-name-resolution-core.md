---
"@openzeppelin/adapter-evm-core": minor
---

Add the ENS name-resolution capability for EVM: forward resolution (`resolveName`), reverse resolution (`resolveAddress` with a concrete `forwardVerified` boolean and optional avatar), the synchronous `isValidName` shape check, and the native-error → closed 7-code `NameResolutionError` mapping (expected failures return `{ ok: false }` and never throw). Includes ENS v2 (L1-only: CCIP-Read + cross-chain via `coinType`) with the EVM-specific `EnsProvenance` extension type and the `isEnsProvenance` type guard.

Hardening: the SF-5 forward path builds its observing client with `retryCount: 0` so the borrowed transport is the sole retry owner (no `elapsedMs` inflation into `RESOLUTION_TIMEOUT`), and error-mapping credential redaction is widened to base64url and hyphenated bare-trailing keys plus more keyed query params (the opaque `cause` stays unredacted).
