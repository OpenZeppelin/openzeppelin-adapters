import { useDisconnect, type UseDisconnectReturnType } from 'wagmi';

/**
 * Backwards-compatible alias for wagmi's disconnect hook.
 *
 * The reconnect workaround path is no longer active now that wallet providers are scoped to
 * ecosystem sessions instead of network remounts, but this export remains for compatibility.
 */
export function useManagedWagmiDisconnect(): UseDisconnectReturnType {
  return useDisconnect();
}
