import { Wallet } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Button } from '@openzeppelin/ui-components';
import { useDerivedAccountStatus } from '@openzeppelin/ui-react';
import type { BaseComponentProps, WalletComponentSize } from '@openzeppelin/ui-types';
import { cn, getWalletButtonSizeProps } from '@openzeppelin/ui-utils';

import { SafeWagmiComponent } from '../SafeWagmiComponent';
import { ConnectorDialog } from './ConnectorDialog';

/**
 * A button that allows users to connect their wallet.
 * Opens a dialog to select from available connectors.
 * @param hideWhenConnected - Whether to hide the button when wallet is connected (default: true)
 * @param showInjectedConnector - Whether to show the injected connector in the dialog (default: false)
 */
export interface ConnectButtonProps extends BaseComponentProps {
  hideWhenConnected?: boolean;
  showInjectedConnector?: boolean;
}

export const CustomConnectButton: React.FC<ConnectButtonProps> = ({
  className,
  size,
  variant,
  fullWidth,
  hideWhenConnected = true,
  showInjectedConnector = false,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const sizeProps = getWalletButtonSizeProps(size);

  const unavailableButton = (
    <div className={cn('flex items-center', fullWidth && 'w-full', className)}>
      <Button
        disabled={true}
        variant={variant || 'outline'}
        size={sizeProps.size}
        className={cn(sizeProps.className, fullWidth && 'w-full')}
      >
        <Wallet className={cn(sizeProps.iconSize, 'mr-1')} />
        Wallet Unavailable
      </Button>
    </div>
  );

  return (
    <SafeWagmiComponent fallback={unavailableButton}>
      <ConnectButtonContent
        className={className}
        size={size}
        variant={variant}
        fullWidth={fullWidth}
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        hideWhenConnected={hideWhenConnected}
        showInjectedConnector={showInjectedConnector}
      />
    </SafeWagmiComponent>
  );
};

const ConnectButtonContent: React.FC<{
  className?: string;
  size?: WalletComponentSize;
  variant?: BaseComponentProps['variant'];
  fullWidth?: boolean;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  hideWhenConnected: boolean;
  showInjectedConnector: boolean;
}> = ({
  className,
  size,
  variant,
  fullWidth,
  dialogOpen,
  setDialogOpen,
  hideWhenConnected,
  showInjectedConnector,
}) => {
  const accountStatus = useDerivedAccountStatus();
  const sizeProps = getWalletButtonSizeProps(size);

  const isConnected = accountStatus.isConnected;

  useEffect(() => {
    if (isConnected && hideWhenConnected) {
      setDialogOpen(false);
    }
  }, [isConnected, hideWhenConnected, setDialogOpen]);

  const handleConnectClick = () => {
    if (!isConnected) {
      setDialogOpen(true);
    }
  };

  if (isConnected && hideWhenConnected) {
    return null;
  }

  return (
    <div className={cn('flex items-center', fullWidth && 'w-full', className)}>
      <Button
        onClick={handleConnectClick}
        disabled={isConnected}
        variant={variant || 'outline'}
        size={sizeProps.size}
        className={cn(sizeProps.className, fullWidth && 'w-full')}
        title={isConnected ? 'Connected' : 'Connect Wallet'}
      >
        <Wallet className={cn(sizeProps.iconSize, 'mr-1')} />
        Connect Wallet
      </Button>

      <ConnectorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        showInjectedConnector={showInjectedConnector}
      />
    </div>
  );
};
