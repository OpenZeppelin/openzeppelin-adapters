import type { UiLabelsCapability } from '@openzeppelin/ui-types';

import { getEvmUiLabels } from './helpers';

export function createUiLabels(
  labels: Record<string, string> = getEvmUiLabels()
): UiLabelsCapability {
  const stableLabels = { ...labels };

  return {
    getUiLabels(): Record<string, string> {
      return { ...stableLabels };
    },
  };
}
