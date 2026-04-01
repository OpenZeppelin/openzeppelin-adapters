import { describe, expect, it } from 'vitest';

import { getStellarConnectUiState } from '../connectUiState';

describe('getStellarConnectUiState', () => {
  it('keeps the button enabled while a previous session is restoring', () => {
    expect(
      getStellarConnectUiState({
        isConnected: false,
        isConnecting: false,
        isReconnecting: true,
        isManuallyInitiated: false,
        dialogOpen: false,
      })
    ).toEqual({
      canStartManualConnect: true,
      shouldDisableButton: false,
      showButtonLoading: true,
      buttonLabel: 'Restoring...',
    });
  });

  it('disables the button during an explicit connect flow', () => {
    expect(
      getStellarConnectUiState({
        isConnected: false,
        isConnecting: true,
        isReconnecting: false,
        isManuallyInitiated: false,
        dialogOpen: false,
      })
    ).toEqual({
      canStartManualConnect: false,
      shouldDisableButton: true,
      showButtonLoading: true,
      buttonLabel: 'Connecting...',
    });
  });
});
