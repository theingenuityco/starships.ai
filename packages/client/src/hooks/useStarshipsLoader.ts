import { useEffect, useRef } from 'react';
import { useStarshipStore } from '@/store/starship-store';

interface UseStarshipsLoaderOptions {
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnVisibilityChange?: boolean;
  refetchInterval?: number;
}

/**
 * Custom hook to manage starship loading with deduplication
 * Prevents multiple simultaneous API calls
 */
export function useStarshipsLoader(options: UseStarshipsLoaderOptions = {}) {
  const {
    enabled = true,
    refetchOnWindowFocus = false,
    refetchOnVisibilityChange = false,
    refetchInterval = 0
  } = options;

  const loadUserStarships = useStarshipStore(state => state.loadUserStarships);
  const starships = useStarshipStore(state => state.starships);
  const loadingStarships = useStarshipStore(state => state.loadingStarships);
  
  const isLoadingRef = useRef(false);
  const lastFetchRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Debounced load function to prevent rapid successive calls
  const loadStarshipsDebounced = async () => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    
    // Prevent calls if already loading or if called within 1 second
    if (isLoadingRef.current || timeSinceLastFetch < 1000) {
      return;
    }

    isLoadingRef.current = true;
    lastFetchRef.current = now;
    
    try {
      await loadUserStarships();
    } finally {
      isLoadingRef.current = false;
    }
  };

  // Initial load
  useEffect(() => {
    if (enabled && !loadingStarships && starships.length === 0) {
      loadStarshipsDebounced();
    }
  }, [enabled]); // Only depend on enabled, not on functions or data

  // Window focus refetch
  useEffect(() => {
    if (!refetchOnWindowFocus || !enabled) return;

    const handleFocus = () => {
      const timeSinceLastFetch = Date.now() - lastFetchRef.current;
      // Only refetch if more than 30 seconds have passed
      if (timeSinceLastFetch > 30000) {
        loadStarshipsDebounced();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchOnWindowFocus, enabled]);

  // Visibility change refetch
  useEffect(() => {
    if (!refetchOnVisibilityChange || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastFetch = Date.now() - lastFetchRef.current;
        // Only refetch if more than 30 seconds have passed
        if (timeSinceLastFetch > 30000) {
          loadStarshipsDebounced();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchOnVisibilityChange, enabled]);

  // Interval refetch
  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    intervalRef.current = setInterval(() => {
      loadStarshipsDebounced();
    }, refetchInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refetchInterval, enabled]);

  return {
    loadStarships: loadStarshipsDebounced,
    isLoading: loadingStarships,
    starships
  };
}