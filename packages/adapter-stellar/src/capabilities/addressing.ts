import type { AddressingCapability } from '@openzeppelin/ui-types';

import { isValidAddress, type StellarAddressType } from '../validation';

export function createAddressing(): AddressingCapability {
  return {
    isValidAddress(address: string, addressType?: string): boolean {
      return isValidAddress(address, addressType as StellarAddressType);
    },
  };
}
