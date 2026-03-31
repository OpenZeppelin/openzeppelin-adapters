import type { AddressingCapability } from '@openzeppelin/ui-types';

import { isValidEvmAddress } from '../validation';

export function createAddressing(): AddressingCapability {
  return {
    isValidAddress(address: string): boolean {
      return isValidEvmAddress(address);
    },
  };
}
