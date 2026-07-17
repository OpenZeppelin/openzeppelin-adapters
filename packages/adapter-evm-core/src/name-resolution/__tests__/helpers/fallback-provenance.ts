/**
 * SF-2 test helpers — chain-agnostic fallback classifiers and triplet assertions.
 * Mirrors the UIKit sibling contract (`isCrossNetworkFallback` / completeness check).
 */
import { expect } from 'vitest';

import type { ResolutionProvenance } from '@openzeppelin/ui-types';

import { MAINNET_NETWORK_ID } from '../../provenance';

/** Principle II / SC-004 — base-field classifier only (INV-4 / INV-19). */
export function isCrossNetworkFallback(
  provenance: Pick<ResolutionProvenance, 'resolvedViaNetworkFallback'>
): boolean {
  return provenance.resolvedViaNetworkFallback === true;
}

/** Strict triplet integrity validator for tests (INV-3). */
export function isCompleteNetworkFallbackProvenance(
  provenance: ResolutionProvenance
): provenance is ResolutionProvenance & {
  readonly resolvedViaNetworkFallback: true;
  readonly queriedOnNetworkId: string;
  readonly resolvedOnNetworkId: string;
} {
  return (
    provenance.resolvedViaNetworkFallback === true &&
    typeof provenance.queriedOnNetworkId === 'string' &&
    provenance.queriedOnNetworkId !== '' &&
    typeof provenance.resolvedOnNetworkId === 'string' &&
    provenance.resolvedOnNetworkId !== ''
  );
}

/** Show/hide gate — unchanged 002 contract; fallback fields MUST NOT affect scope (INV-25). */
export function chainAgnosticScope(provenance: ResolutionProvenance): 'global' | { local: string } {
  if ('scopedToNetworkId' in provenance && provenance.scopedToNetworkId !== undefined) {
    return { local: provenance.scopedToNetworkId };
  }
  return 'global';
}

export function expectNoFallbackTriplet(provenance: ResolutionProvenance): void {
  expect(provenance.resolvedViaNetworkFallback).toBeUndefined();
  expect(provenance.queriedOnNetworkId).toBeUndefined();
  expect(provenance.resolvedOnNetworkId).toBeUndefined();
  expect(isCrossNetworkFallback(provenance)).toBe(false);
}

export function expectCompleteFallbackTriplet(
  provenance: ResolutionProvenance,
  queriedOnNetworkId: string
): void {
  expect(isCrossNetworkFallback(provenance)).toBe(true);
  expect(isCompleteNetworkFallbackProvenance(provenance)).toBe(true);
  expect(provenance.resolvedViaNetworkFallback).toBe(true);
  expect(provenance.queriedOnNetworkId).toBe(queriedOnNetworkId);
  expect(provenance.resolvedOnNetworkId).toBe(MAINNET_NETWORK_ID);
  expect('scopedToNetworkId' in provenance).toBe(false);
}
