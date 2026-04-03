export interface StellarConnectUiStateInput {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isManuallyInitiated: boolean;
  dialogOpen: boolean;
}

export interface StellarConnectUiState {
  canStartManualConnect: boolean;
  shouldDisableButton: boolean;
  showButtonLoading: boolean;
  buttonLabel: 'Connect Wallet' | 'Connecting...' | 'Restoring...';
}

/**
 * Passive session restoration should not remove the user's ability to recover
 * manually through the connector dialog.
 */
export function getStellarConnectUiState(input: StellarConnectUiStateInput): StellarConnectUiState {
  const isRestoringSession =
    input.isReconnecting && !input.isConnecting && !input.isManuallyInitiated && !input.dialogOpen;

  const canStartManualConnect =
    !input.isConnected && !input.isConnecting && !input.isManuallyInitiated;

  const showButtonLoading = input.isConnecting || input.isManuallyInitiated || isRestoringSession;

  const buttonLabel = isRestoringSession
    ? 'Restoring...'
    : showButtonLoading
      ? 'Connecting...'
      : 'Connect Wallet';

  return {
    canStartManualConnect,
    shouldDisableButton: input.isConnected || input.isConnecting || input.isManuallyInitiated,
    showButtonLoading,
    buttonLabel,
  };
}
