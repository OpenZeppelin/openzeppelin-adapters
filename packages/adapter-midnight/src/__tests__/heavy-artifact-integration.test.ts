import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { getSharedMidnightArtifactContext } from '../capabilities/artifact-context';
import { createContractLoading } from '../capabilities/contract-loading';
import { midnightTestnet } from '../networks/testnet';
import { stripZipForFunction } from '../utils/zip-slimmer';

describe('Midnight contract-loading — heavy artifact handling', () => {
  const networkConfig = midnightTestnet;

  describe('getArtifactPersistencePolicy', () => {
    it('should return deferred policy with 15MB threshold', () => {
      const contractLoading = createContractLoading(
        networkConfig,
        getSharedMidnightArtifactContext(networkConfig)
      );
      try {
        const policy = contractLoading.getArtifactPersistencePolicy?.();

        expect(policy).toBeDefined();
        expect(policy?.mode).toBe('deferredUntilFunctionSelected');
        expect(policy?.sizeThresholdBytes).toBe(15 * 1024 * 1024);
      } finally {
        contractLoading.dispose();
      }
    });
  });

  describe('prepareArtifactsForFunction', () => {
    it('should trim artifacts and return persistable data', async () => {
      const contractLoading = createContractLoading(
        networkConfig,
        getSharedMidnightArtifactContext(networkConfig)
      );

      try {
        const zip = new JSZip();
        zip.file('contract/index.cjs', 'module.exports = {}');
        zip.file('contract/index.d.ts', 'export type Circuits = {};');
        zip.file('witnesses.js', 'export const witnesses = {}');
        zip.file('keys/increment.prover', new Uint8Array([1, 2, 3]));
        zip.file('keys/increment.verifier', new Uint8Array([4, 5, 6]));
        zip.file('zkir/increment.bzkir', new Uint8Array([7, 8, 9]));
        zip.file('keys/decrement.prover', new Uint8Array([10, 11, 12]));
        zip.file('keys/decrement.verifier', new Uint8Array([13, 14, 15]));
        zip.file('zkir/decrement.bzkir', new Uint8Array([16, 17, 18]));

        const originalZip = await zip.generateAsync({ type: 'uint8array' });
        const base64Zip = Buffer.from(originalZip).toString('base64');

        const currentArtifacts = {
          contractAddress: '0x123',
          privateStateId: 'test-state',
          contractModule: 'module.exports = {}',
          contractDefinition: 'export type Circuits = {};',
          witnessCode: 'export const witnesses = {}',
          originalZipData: base64Zip,
        };

        const result = await contractLoading.prepareArtifactsForFunction!({
          functionId: 'increment',
          currentArtifacts,
        });

        expect(result.persistableArtifacts).toBeDefined();
        expect(result.persistableArtifacts?.privateStateId).toBe('test-state');
        expect(result.persistableArtifacts?.contractModule).toBe('module.exports = {}');
        expect(result.persistableArtifacts?.contractDefinition).toBe('export type Circuits = {};');
        expect(result.persistableArtifacts?.witnessCode).toBe('export const witnesses = {}');
        expect(result.persistableArtifacts?.trimmedZipBase64).toBeDefined();
        expect(result.persistableArtifacts?.originalZipData).toBeUndefined();

        expect(result.publicAssets).toBeDefined();
        expect(result.publicAssets?.['public/midnight/contract.zip']).toBeDefined();

        expect(result.bootstrapSource).toBeDefined();
        expect(result.bootstrapSource?.contractAddress).toBe('0x123');
        expect(result.bootstrapSource?.privateStateId).toBe('test-state');
        expect(result.bootstrapSource?.contractArtifactsUrl).toBe('/midnight/contract.zip');
      } finally {
        contractLoading.dispose();
      }
    });

    it('should handle missing ZIP gracefully', async () => {
      const contractLoading = createContractLoading(
        networkConfig,
        getSharedMidnightArtifactContext(networkConfig)
      );

      try {
        const currentArtifacts = {
          contractAddress: '0x123',
          privateStateId: 'test-state',
          contractModule: 'module.exports = {}',
          contractDefinition: 'export type Circuits = {};',
          witnessCode: 'export const witnesses = {}',
        };

        const result = await contractLoading.prepareArtifactsForFunction!({
          functionId: 'increment',
          currentArtifacts,
        });

        expect(result.persistableArtifacts).toBeDefined();
        expect(result.persistableArtifacts?.privateStateId).toBe('test-state');
        expect(result.persistableArtifacts?.contractModule).toBe('module.exports = {}');
        expect(result.persistableArtifacts?.contractDefinition).toBe('export type Circuits = {};');
        expect(result.publicAssets).toBeUndefined();
      } finally {
        contractLoading.dispose();
      }
    });

    it('should handle trimming errors gracefully', async () => {
      const contractLoading = createContractLoading(
        networkConfig,
        getSharedMidnightArtifactContext(networkConfig)
      );

      try {
        const currentArtifacts = {
          contractAddress: '0x123',
          privateStateId: 'test-state',
          contractModule: 'module.exports = {}',
          contractDefinition: 'export type Circuits = {};',
          witnessCode: 'export const witnesses = {}',
          originalZipData: 'invalid-base64',
        };

        const result = await contractLoading.prepareArtifactsForFunction!({
          functionId: 'increment',
          currentArtifacts,
        });

        expect(result.persistableArtifacts).toBeDefined();
        expect(result.persistableArtifacts?.privateStateId).toBe('test-state');
        expect(result.persistableArtifacts?.contractDefinition).toBe('export type Circuits = {};');
        expect(result.persistableArtifacts?.trimmedZipBase64).toBeUndefined();
      } finally {
        contractLoading.dispose();
      }
    });
  });

  describe('Export flow with trimmed artifacts', () => {
    it('should produce smaller ZIP after trimming', async () => {
      const zip = new JSZip();
      zip.file('contract/index.cjs', 'module.exports = {}');
      zip.file('contract/index.d.ts', 'export type Circuits = {};');
      zip.file('witnesses.js', 'export const witnesses = {}');

      const largeData = new Uint8Array(10000).fill(0);
      for (const circuit of ['circuit1', 'circuit2', 'circuit3']) {
        zip.file(`keys/${circuit}.prover`, largeData);
        zip.file(`keys/${circuit}.verifier`, largeData);
        zip.file(`zkir/${circuit}.bzkir`, largeData);
      }

      const originalZip = await zip.generateAsync({ type: 'uint8array' });
      const trimmed = await stripZipForFunction(originalZip, 'circuit1');

      expect(trimmed.length).toBeLessThan(originalZip.length / 2);

      const trimmedZip = await JSZip.loadAsync(trimmed);
      const files = Object.keys(trimmedZip.files);

      expect(files).toContain('keys/circuit1.prover');
      expect(files).toContain('keys/circuit1.verifier');
      expect(files).toContain('zkir/circuit1.bzkir');

      expect(files).not.toContain('keys/circuit2.prover');
      expect(files).not.toContain('keys/circuit3.prover');
    });
  });
});
