/**
 * Name-resolution domain barrel.
 *
 * SF-1 delivers the native-error → `NameResolutionError` mapping layer. Later sub-features append
 * to this barrel without restructuring it:
 * - SF-2 adds the forward service (`resolveName`), the sync `isValidName`/`normalizeName` shape gate,
 *   and the `baseEnsProvenance` builder. The `createNameResolution` capability factory itself lives
 *   in `../capabilities/name-resolution`.
 * - SF-5 adds the `EnsProvenance` extension type, the `isEnsProvenance` type guard, and the forward
 *   provenance/coinType builders (`buildEnsProvenance`, `deriveCoinType`, `scopedNetworkId`).
 *
 * @module name-resolution
 */

export {
  ELAPSED_UNMEASURED,
  addressNotFound,
  mapNameResolutionError,
  nameNotFound,
  unsupportedName,
  unsupportedNetwork,
  type NameResolutionErrorContext,
} from './error-mapping';
export {
  buildEnsProvenance,
  deriveCoinType,
  isEnsProvenance,
  scopedNetworkId,
  type EnsProvenance,
} from './ens-provenance';
export { isValidName, normalizeName } from './name-validation';
export {
  baseEnsProvenance,
  boundReverseProvenance,
  composeNetworkFallbackProvenance,
  MAINNET_NETWORK_ID,
  networkFallbackProvenanceFields,
} from './provenance';
export {
  EvmNameResolutionService,
  createEvmNameResolutionService,
  type CreateEvmNameResolutionServiceOptions,
} from './service';
