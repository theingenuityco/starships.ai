import { useState, useEffect, useRef, useCallback } from 'react';

export type ProximityState = 'far' | 'near' | 'engaged';

interface ProximityOptions {
  nearThreshold?: number;    // Distance in pixels to trigger 'near' state
  engageThreshold?: number;  // Distance in pixels to trigger 'engaged' state
  debounceMs?: number;       // Debounce time for state changes
  mode?: 'element' | 'left-edge'; // NEW: Detection mode
}

interface MousePosition {
  x: number;
  y: number;
}

export function useProximityDetection(options: ProximityOptions = {}) {
  const {
    nearThreshold = 150,
    engageThreshold = 75,
    debounceMs = 100,
    mode = 'element' // NEW: Default to existing behavior
  } = options;

  const [proximityState, setProximityState] = useState<ProximityState>('far');
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  
  const targetRef = useRef<HTMLElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const lastMouseMoveTimeRef = useRef<number>(Date.now());
  const inactivityTimeoutRef = useRef<NodeJS.Timeout>();

  // Calculate distance based on mode
  const calculateDistance = useCallback((mouseX: number, mouseY: number, rect?: DOMRect) => {
    if (mode === 'left-edge') {
      // Distance from left edge of screen
      return mouseX;
    }
    
    // Existing element-based calculation
    if (!rect) return Infinity;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    return Math.sqrt(
      Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
    );
  }, [mode]);

  // Determine proximity state based on distance
  const getProximityState = useCallback((distance: number, isDirectlyHovering: boolean): ProximityState => {
    if (mode === 'element' && (isDirectlyHovering || distance <= engageThreshold)) {
      return 'engaged';
    } else if (distance <= engageThreshold) {
      return 'engaged';
    } else if (distance <= nearThreshold) {
      return 'near';
    } else {
      return 'far';
    }
  }, [engageThreshold, nearThreshold, mode]);

  // Debounced state update
  const updateProximityState = useCallback((newState: ProximityState) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setProximityState(current => {
        // Only update if state actually changed
        return current !== newState ? newState : current;
      });
    }, debounceMs);
  }, [debounceMs]);

  // Mouse move handler
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const newPosition = { x: event.clientX, y: event.clientY };
    setMousePosition(newPosition);
    lastMouseMoveTimeRef.current = Date.now();

    const rect = mode === 'element' ? targetRef.current?.getBoundingClientRect() : undefined;
    const distance = calculateDistance(event.clientX, event.clientY, rect);
    const newState = getProximityState(distance, isHovering);
    
    updateProximityState(newState);
  }, [calculateDistance, getProximityState, isHovering, updateProximityState, mode]);

  // Mouse enter/leave handlers for direct hovering (element mode only)
  const handleMouseEnter = useCallback(() => {
    if (mode === 'element') {
      setIsHovering(true);
      updateProximityState('engaged');
    }
  }, [updateProximityState, mode]);

  const handleMouseLeave = useCallback(() => {
    if (mode === 'element') {
      setIsHovering(false);
    }
  }, [mode]);

  // Set up event listeners
  useEffect(() => {
    // Always attach mouse move listener to window for tracking
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    // Only attach hover listeners for element mode
    if (mode === 'element') {
      const target = targetRef.current;
      if (target) {
        target.addEventListener('mouseenter', handleMouseEnter);
        target.addEventListener('mouseleave', handleMouseLeave);
      }
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      
      if (mode === 'element') {
        const target = targetRef.current;
        if (target) {
          target.removeEventListener('mouseenter', handleMouseEnter);
          target.removeEventListener('mouseleave', handleMouseLeave);
        }
      }
      
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      if (inactivityTimeoutRef.current) {
        clearInterval(inactivityTimeoutRef.current);
      }
    };
  }, [handleMouseMove, handleMouseEnter, handleMouseLeave, mode]);

  // Performance: Reset to 'far' when mouse hasn't moved for a while
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const timeSinceLastMove = now - lastMouseMoveTimeRef.current;
      
      if (timeSinceLastMove >= 3000 && !isHovering) {
        setProximityState(currentState => {
          return currentState !== 'far' ? 'far' : currentState;
        });
      }
    };

    // Check inactivity every 1 second
    inactivityTimeoutRef.current = setInterval(checkInactivity, 1000);

    return () => {
      if (inactivityTimeoutRef.current) {
        clearInterval(inactivityTimeoutRef.current);
      }
    };
  }, [isHovering]);

  return {
    proximityState,
    mousePosition,
    isHovering,
    targetRef,
    // Utility methods for consumers
    isNear: proximityState === 'near' || proximityState === 'engaged',
    isEngaged: proximityState === 'engaged',
    isFar: proximityState === 'far'
  };
} 