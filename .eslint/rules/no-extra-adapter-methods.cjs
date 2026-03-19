/**
 * @fileoverview Rule to enforce that adapter classes only implement methods defined in the ContractAdapter interface
 *
 * IMPORTANT: This is the central location for this rule in the monorepo.
 * It is referenced from both the root ESLint configuration and package configurations.
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that adapter classes only implement methods defined in the ContractAdapter interface',
      category: 'TypeScript',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      extraMethod: "Method '{{method}}' is not defined in the ContractAdapter interface.",
      extraPrivateMethod:
        "Private method '{{method}}' should be marked with the 'private' keyword.",
    },
  },

  create(context) {
    const interfaceMethods = [
      'networkConfig',
      'initialAppServiceKitName',
      'getNetworkServiceForms',
      'validateNetworkServiceConfig',
      'testNetworkServiceConnection',
      'loadContract',
      'loadContractWithMetadata',
      'getWritableFunctions',
      'mapParameterTypeToFieldType',
      'getCompatibleFieldTypes',
      'generateDefaultField',
      'formatTransactionData',
      'signAndBroadcast',
      'isValidAddress',
      'getSupportedExecutionMethods',
      'validateExecutionConfig',
      'isViewFunction',
      'filterAutoQueryableFunctions',
      'queryViewFunction',
      'formatFunctionResult',
      'supportsWalletConnection',
      'getAvailableConnectors',
      'connectWallet',
      'disconnectWallet',
      'getWalletConnectionStatus',
      'onWalletConnectionChange',
      'getExplorerUrl',
      'getExplorerTxUrl',
      'getCurrentBlock',
      'waitForTransactionConfirmation',
      'configureUiKit',
      'getEcosystemReactUiContextProvider',
      'getEcosystemReactHooks',
      'getEcosystemWalletComponents',
      'getAvailableUiKits',
      'getUiLabels',
      'getExportableWalletConfigFiles',
      'getSupportedContractDefinitionProviders',
      'getContractDefinitionInputs',
      'getRuntimeFieldBinding',
      'getFunctionDecorations',
      'getRelayers',
      'getRelayer',
      'getRelayerOptionsComponent',
      'validateRpcEndpoint',
      'testRpcConnection',
      'validateExplorerConfig',
      'testExplorerConnection',
      'compareContractDefinitions',
      'validateContractDefinition',
      'hashContractDefinition',
      'getExportBootstrapFiles',
      'getArtifactPersistencePolicy',
      'prepareArtifactsForFunction',
      'getAccessControlService',
      'getTypeMappingInfo',
      'getDefaultServiceConfig',
    ];

    const allowedMethods = ['constructor', 'toString', 'toJSON', 'valueOf'];

    return {
      ClassDeclaration(node) {
        if (
          node.implements &&
          node.implements.some(
            (impl) => impl.expression && impl.expression.name === 'ContractAdapter'
          )
        ) {
          node.body.body.forEach((member) => {
            if (member.type === 'MethodDefinition') {
              const methodName = member.key.name;

              if (allowedMethods.includes(methodName) || interfaceMethods.includes(methodName)) {
                return;
              }

              if (methodName.startsWith('_')) {
                if (!member.accessibility || member.accessibility !== 'private') {
                  context.report({
                    node: member,
                    messageId: 'extraPrivateMethod',
                    data: { method: methodName },
                  });
                }
                return;
              }

              if (!member.accessibility || member.accessibility !== 'private') {
                context.report({
                  node: member,
                  messageId: 'extraMethod',
                  data: { method: methodName },
                });
              }
            }
          });
        }
      },
    };
  },
};
