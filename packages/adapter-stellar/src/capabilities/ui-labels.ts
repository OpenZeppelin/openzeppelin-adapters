import type { UiLabelsCapability } from '@openzeppelin/ui-types';

import { getStellarUiLabels } from './helpers';

export function createUiLabels(): UiLabelsCapability {
  return {
    getUiLabels() {
      return getStellarUiLabels();
    },
  };
}
