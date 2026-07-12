import { describeConformance } from '../vitest-binding';
import {
  compliantForward,
  FORWARD_VECTORS,
  makeCompliant,
  makeStub,
  REVERSE_VECTORS,
} from './fixtures';

/**
 * Real top-level usage of the vitest binding (INV-19): `describeConformance` runs
 * `checkConformance` once at collection time and projects each result onto an `it()` /
 * `it.skip()`. A green run here proves the projection is faithful end-to-end over the
 * compliant reference. (A forward-only variant exercises the SKIP projection.)
 */

await describeConformance({
  suiteName: 'compliant reference (binding smoke)',
  makeCapability: () => makeCompliant(),
  forwardVectors: FORWARD_VECTORS,
  reverseVectors: REVERSE_VECTORS,
});

await describeConformance({
  suiteName: 'forward-only (binding SKIP projection)',
  makeCapability: () => makeStub({ resolveName: compliantForward }), // no resolveAddress
  forwardVectors: FORWARD_VECTORS,
  reverseVectors: REVERSE_VECTORS, // reverse family + INV-6 project as it.skip()
});
