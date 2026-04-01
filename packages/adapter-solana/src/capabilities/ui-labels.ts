import type { UiLabelsCapability } from '@openzeppelin/ui-types';

const SOLANA_UI_LABELS: Record<string, string> = {
  relayerConfigTitle: 'Transaction Configuration',
  relayerConfigActiveDesc: 'Customize transaction parameters for submission',
  relayerConfigInactiveDesc: 'Using recommended transaction configuration for reliability',
  relayerConfigPresetTitle: 'Recommended Preset Active',
  relayerConfigPresetDesc: 'Transactions will use recommended parameters for quick inclusion',
  relayerConfigCustomizeBtn: 'Customize Settings',
  detailsTitle: 'Relayer Details',
  network: 'Network',
  relayerId: 'Relayer ID',
  active: 'Active',
  paused: 'Paused',
  systemDisabled: 'System Disabled',
  balance: 'Balance',
  nonce: 'Recent Blockhash',
  pending: 'Pending Transactions',
  lastTransaction: 'Last Transaction',
};

export function createUiLabels(): UiLabelsCapability {
  return {
    getUiLabels() {
      return { ...SOLANA_UI_LABELS };
    },
  };
}
