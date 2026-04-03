import type { UiLabelsCapability } from '@openzeppelin/ui-types';

const POLKADOT_UI_LABELS: Record<string, string> = {
  relayerConfigTitle: 'Gas Configuration',
  relayerConfigActiveDesc: 'Customize gas pricing strategy for transaction submission',
  relayerConfigInactiveDesc: 'Using recommended gas configuration for reliable transactions',
  relayerConfigPresetTitle: 'Fast Speed Preset Active',
  relayerConfigPresetDesc: 'Transactions will use high priority gas pricing for quick inclusion',
  relayerConfigCustomizeBtn: 'Customize Gas Settings',
  detailsTitle: 'Relayer Details',
  network: 'Network',
  relayerId: 'Relayer ID',
  active: 'Active',
  paused: 'Paused',
  systemDisabled: 'System Disabled',
  balance: 'Balance',
  nonce: 'Nonce',
  pending: 'Pending Transactions',
  lastTransaction: 'Last Transaction',
};

export function createUiLabels(): UiLabelsCapability {
  return {
    getUiLabels() {
      return { ...POLKADOT_UI_LABELS };
    },
  };
}
