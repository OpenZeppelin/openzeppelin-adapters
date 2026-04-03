import type { UiLabelsCapability } from '@openzeppelin/ui-types';

import { getMidnightUiLabels } from './helpers';

export function createUiLabels(): UiLabelsCapability {
  return {
    getUiLabels() {
      return getMidnightUiLabels();
    },
  };
}
