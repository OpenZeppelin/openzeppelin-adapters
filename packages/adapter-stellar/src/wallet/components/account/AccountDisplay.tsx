import { LogOut } from 'lucide-react';
import React from 'react';

import { AddressDisplay, Button } from '@openzeppelin/ui-components';
import type { BaseComponentProps } from '@openzeppelin/ui-types';
import { cn, getWalletAccountDisplaySizeProps } from '@openzeppelin/ui-utils';

import { useStellarAccount, useStellarDisconnect } from '../../hooks';

/**
 * A component that displays the connected account address.
 * Also includes a disconnect button.
 */
export const CustomAccountDisplay: React.FC<BaseComponentProps> = ({
  className,
  size,
  variant,
  fullWidth,
}) => {
  const { isConnected, address } = useStellarAccount();
  const { disconnect } = useStellarDisconnect();

  const sizeProps = getWalletAccountDisplaySizeProps(size);

  if (!isConnected || !address) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', fullWidth && 'w-full', className)}>
      <div className={cn('group flex flex-col', fullWidth && 'flex-1')}>
        <AddressDisplay
          address={address}
          variant="inline"
          startChars={4}
          endChars={4}
          showTooltip
          showCopyButton
          showCopyButtonOnHover
          className={cn(sizeProps.textSize, 'font-sans font-medium')}
        />
        <span className={cn(sizeProps.subTextSize, 'text-muted-foreground -mt-0.5')}>
          Stellar Account
        </span>
      </div>
      {disconnect && (
        <Button
          onClick={() => disconnect()}
          variant={variant || 'ghost'}
          size="icon"
          className={cn(sizeProps.iconButtonSize, 'p-0')}
          title="Disconnect wallet"
        >
          <LogOut className={sizeProps.iconSize} />
        </Button>
      )}
    </div>
  );
};
