import React, { useEffect, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@openzeppelin/ui-components';
import { useDerivedAccountStatus, useDerivedConnectStatus } from '@openzeppelin/ui-react';
import type { Connector } from '@openzeppelin/ui-types';

import { SafeWagmiComponent } from '../SafeWagmiComponent';

interface ConnectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showInjectedConnector?: boolean;
}

export const ConnectorDialog: React.FC<ConnectorDialogProps> = ({
  open,
  onOpenChange,
  showInjectedConnector = false,
}) => {
  const unavailableContent = (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Wallet Connection Unavailable</DialogTitle>
          <DialogDescription>
            The wallet connection system is not properly initialized.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );

  return (
    <SafeWagmiComponent fallback={unavailableContent}>
      <ConnectorDialogContent
        open={open}
        onOpenChange={onOpenChange}
        showInjectedConnector={showInjectedConnector}
      />
    </SafeWagmiComponent>
  );
};

function isAlreadyConnectedError(error: Error | null | undefined): boolean {
  return !!error?.message?.includes('Connector already connected');
}

const ConnectorDialogContent: React.FC<ConnectorDialogProps> = ({
  open,
  onOpenChange,
  showInjectedConnector = false,
}) => {
  const { connect, connectors, error: connectError } = useDerivedConnectStatus();
  const accountStatus = useDerivedAccountStatus();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const isConnected = accountStatus.isConnected;

  // Close the dialog when connection succeeds (including auto-reconnect).
  useEffect(() => {
    if (isConnected && open) {
      onOpenChange(false);
      setConnectingId(null);
    }
  }, [isConnected, onOpenChange, open]);

  // "Connector already connected" means wagmi auto-reconnected while the dialog
  // was opening. Treat it as a successful connection — close the dialog.
  useEffect(() => {
    if (open && isAlreadyConnectedError(connectError)) {
      onOpenChange(false);
      setConnectingId(null);
    }
  }, [connectError, onOpenChange, open]);

  useEffect(() => {
    if (!open && connectingId) {
      setConnectingId(null);
    }
  }, [connectingId, open]);

  useEffect(() => {
    if (connectError && !isAlreadyConnectedError(connectError)) {
      setConnectingId(null);
    }
  }, [connectError]);

  if (!connect) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <p>Wallet connection function is not available.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const canSelectConnector = !isConnected && connectingId === null;

  const handleConnectorSelect = (selectedConnector: Connector) => {
    if (!canSelectConnector) {
      return;
    }

    setConnectingId(selectedConnector.id);
    connect({ connector: selectedConnector });
  };

  const filteredConnectors = connectors.filter((connector: Connector) => {
    const isInjected = connector.id === 'injected';
    return !(isInjected && !showInjectedConnector);
  });

  const displayError = connectError && !isAlreadyConnectedError(connectError) ? connectError : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Select a wallet provider to connect with this application.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {filteredConnectors.length === 0 ? (
            <p className="text-center text-muted-foreground">No wallet connectors available.</p>
          ) : (
            filteredConnectors.map((connector: Connector) => (
              <Button
                key={connector.id}
                onClick={() => handleConnectorSelect(connector)}
                disabled={!canSelectConnector}
                variant="outline"
                className="flex justify-between items-center w-full py-6"
              >
                <span>{connector.name}</span>
                {connectingId === connector.id && (
                  <span className="ml-2 text-xs">Connecting...</span>
                )}
              </Button>
            ))
          )}
        </div>

        {displayError && (
          <p className="text-sm text-red-500 mt-1">
            {displayError.message || 'Error connecting wallet'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
