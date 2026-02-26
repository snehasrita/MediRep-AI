"use client";

import { SWRConfig } from "swr";
import { ReactNode } from "react";

interface SWRProviderProps {
  children: ReactNode;
}

/**
 * Global SWR configuration provider.
 * 
 * Configuration:
 * - `revalidateOnFocus: false`: Don't refetch when window regains focus (reduces API calls)
 * - `revalidateOnReconnect: true`: Refetch when network reconnects
 * - `dedupingInterval: 60000`: Dedupe requests within 60 seconds
 * - `errorRetryCount: 2`: Retry failed requests twice
 * - `focusThrottleInterval: 120000`: Throttle focus revalidations to 2 minutes
 */
export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000,
        errorRetryCount: 2,
        focusThrottleInterval: 120000,
        // Keep previous data while revalidating for instant UI
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
