---
"@openzeppelin/adapter-polkadot": major
"@openzeppelin/adapter-solana": major
"@openzeppelin/adapter-midnight": major
---

Migrate polkadot, solana, and midnight to `capabilities` and `createRuntime` on `ecosystemDefinition`.
Remove monolithic adapter classes and `createAdapter` exports (Phase 10 / US8 follow-on adapters).