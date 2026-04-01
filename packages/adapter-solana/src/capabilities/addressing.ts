import type { AddressingCapability } from '@openzeppelin/ui-types';

import { isValidSolanaAddress } from '../utils';

export function createAddressing(): AddressingCapability {
  return {
    isValidAddress(address: string): boolean {
      return isValidSolanaAddress(address);
    },
  };
}
