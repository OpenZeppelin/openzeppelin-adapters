import type { ContractLoadingCapability, NetworkConfig } from '@openzeppelin/ui-types';

import { loadMidnightContract, loadMidnightContractWithMetadata } from '../contract';
import { validateAndConvertMidnightArtifacts } from '../utils';
import { prepareArtifactsForFunction as prepareArtifacts } from '../utils/artifact-preparation';
import type { MidnightArtifactContext } from './artifact-context';
import { asMidnightNetworkConfig, withRuntimeCapability } from './helpers';

export function createContractLoading(
  config: NetworkConfig,
  artifactContext: MidnightArtifactContext
): ContractLoadingCapability {
  const networkConfig = asMidnightNetworkConfig(config);

  return Object.assign(withRuntimeCapability(networkConfig, 'contractLoading'), {
    async loadContract(source: string | Record<string, unknown>) {
      const artifacts = await validateAndConvertMidnightArtifacts(source);
      artifactContext.setArtifacts(artifacts);
      const result = await loadMidnightContract(artifacts, networkConfig);
      return result.schema;
    },
    async loadContractWithMetadata(source: string | Record<string, unknown>) {
      const artifacts = await validateAndConvertMidnightArtifacts(source);
      artifactContext.setArtifacts(artifacts);
      const result = await loadMidnightContractWithMetadata(artifacts, networkConfig);
      return {
        schema: result.schema,
        source: result.source,
        contractDefinitionOriginal: result.contractDefinitionOriginal,
        metadata: result.metadata,
        proxyInfo: result.proxyInfo,
        contractDefinitionArtifacts: result.contractDefinitionArtifacts,
      };
    },
    getContractDefinitionInputs() {
      return [
        {
          id: 'contractAddress',
          name: 'contractAddress',
          label: 'Contract Address',
          type: 'blockchain-address',
          validation: { required: true },
          placeholder: '0200326c95873182775840764ae28e8750f73a68f236800171ebd92520e96a9fffb6',
          helperText:
            'Enter the deployed Midnight contract address (68-character hex string starting with 0200).',
        },
        {
          id: 'privateStateId',
          name: 'privateStateId',
          label: 'Private State ID',
          type: 'text',
          validation: { required: true },
          placeholder: 'my-unique-state-id',
          helperText:
            'A unique identifier for your private state instance. This ID is used to manage your personal encrypted data.',
        },
        {
          id: 'contractArtifactsZip',
          name: 'contractArtifactsZip',
          label: 'Contract Build Artifacts (ZIP)',
          type: 'file-upload',
          validation: { required: true },
          accept: '.zip',
          helperText:
            "Select a ZIP file containing your compiled Midnight contract artifacts. The ZIP should include: contract module (.cjs), TypeScript definitions (.d.ts), witness code (witnesses.js), and ZK proof files (.prover, .verifier, .bzkir). Typically created by zipping your project's dist/ directory after running `compact build`. All processing happens locally in your browser.",
          convertToBase64: true,
          maxSize: 10 * 1024 * 1024,
        },
      ];
    },
    getArtifactPersistencePolicy() {
      return {
        mode: 'deferredUntilFunctionSelected',
        sizeThresholdBytes: 15 * 1024 * 1024,
      };
    },
    prepareArtifactsForFunction(args: {
      functionId: string;
      currentArtifacts: Record<string, unknown>;
      definitionOriginal?: string | null;
    }) {
      return prepareArtifacts(args.functionId, args.currentArtifacts);
    },
  }) as ContractLoadingCapability;
}
