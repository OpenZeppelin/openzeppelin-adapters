import type { AddressingCapability } from '@openzeppelin/ui-types';

import { isValidAddress } from '../validation';

export function createAddressing(): AddressingCapability {
  return {
    isValidAddress(address: string): boolean {
      return isValidAddress(address);
    },
  };
}
