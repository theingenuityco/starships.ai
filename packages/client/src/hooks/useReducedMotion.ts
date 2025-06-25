import { useEffect, useState } from 'react';

/**
 * Hook to detect and respect user's reduced motion preferences
 * Automatically detects system preference and allows override
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for system preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);
    
    // Listen for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    // Check for user override in localStorage
    const storedPreference = localStorage.getItem('starship_reduced_motion');
    if (storedPreference !== null) {
      setUserOverride(storedPreference === 'true');
    }
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // The final preference: user override takes precedence over system preference
  const shouldReduceMotion = userOverride !== null ? userOverride : prefersReducedMotion;

  const setReducedMotionPreference = (enabled: boolean) => {
    setUserOverride(enabled);
    localStorage.setItem('starship_reduced_motion', enabled.toString());
  };

  const clearReducedMotionPreference = () => {
    setUserOverride(null);
    localStorage.removeItem('starship_reduced_motion');
  };

  return {
    shouldReduceMotion,
    systemPrefersReducedMotion: prefersReducedMotion,
    userOverride,
    setReducedMotionPreference,
    clearReducedMotionPreference
  };
}

/**
 * Utility function to get motion-safe animation config
 */
export function getMotionConfig(shouldReduceMotion: boolean) {
  if (shouldReduceMotion) {
    return {
      initial: false,
      animate: false,
      exit: false,
      transition: { duration: 0 }
    };
  }
  
  return {
    // Default motion config
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 0.8
    }
  };
} 