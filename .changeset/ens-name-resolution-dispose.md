---
"@openzeppelin/adapter-runtime-utils": patch
---

Fix: include `nameResolution` in `DISPOSABLE_CAPABILITY_KEYS` so `runtime.dispose()` invokes the capability's `dispose()` (previously the optional ENS capability was left undisposed on teardown). Regression: the optional-nameResolution profile-runtime suite asserts the dispose spy is called exactly once and stays idempotent across a second `runtime.dispose()`.
