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
  const isHoveringRef = useRef<boolean>(false);

  // Store options in ref to avoid dependency issues
  const optionsRef = useRef({ nearThreshold, engageThreshold, debounceMs, mode });
  optionsRef.current = { nearThreshold, engageThreshold, debounceMs, mode };

  // Sync isHovering state with ref
  isHoveringRef.current = isHovering;

  // Calculate distance based on mode - stable callback
  const calculateDistance = useCallback((mouseX: number, mouseY: number, rect?: DOMRect) => {
    const currentMode = optionsRef.current.mode;
    if (currentMode === 'left-edge') {
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
  }, []);

  // Determine proximity state based on distance - stable callback
  const getProximityState = useCallback((distance: number, isDirectlyHovering: boolean): ProximityState => {
    const { engageThreshold: currentEngageThreshold, nearThreshold: currentNearThreshold, mode: currentMode } = optionsRef.current;
    
    if (currentMode === 'element' && (isDirectlyHovering || distance <= currentEngageThreshold)) {
      return 'engaged';
    } else if (distance <= currentEngageThreshold) {
      return 'engaged';
    } else if (distance <= currentNearThreshold) {
      return 'near';
    } else {
      return 'far';
    }
  }, []);

  // Debounced state update - stable callback
  const updateProximityState = useCallback((newState: ProximityState) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const currentDebounceMs = optionsRef.current.debounceMs;
    debounceTimeoutRef.current = setTimeout(() => {
      setProximityState(current => {
        // Only update if state actually changed
        return current !== newState ? newState : current;
      });
    }, currentDebounceMs);
  }, []);

  // Mouse move handler - stable callback
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const newPosition = { x: event.clientX, y: event.clientY };
    setMousePosition(newPosition);
    lastMouseMoveTimeRef.current = Date.now();

    const currentMode = optionsRef.current.mode;
    const rect = currentMode === 'element' ? targetRef.current?.getBoundingClientRect() : undefined;
    const distance = calculateDistance(event.clientX, event.clientY, rect);
    
    // Use ref to get current hovering state
    const currentHovering = isHoveringRef.current;
    const newState = getProximityState(distance, currentHovering);
    updateProximityState(newState);
  }, []);

  // Mouse enter/leave handlers for direct hovering (element mode only) - stable callbacks
  const handleMouseEnter = useCallback(() => {
    const currentMode = optionsRef.current.mode;
    if (currentMode === 'element') {
      setIsHovering(true);
      isHoveringRef.current = true;
      updateProximityState('engaged');
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const currentMode = optionsRef.current.mode;
    if (currentMode === 'element') {
      setIsHovering(false);
      isHoveringRef.current = false;
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    // Always attach mouse move listener to window for tracking
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    // Only attach hover listeners for element mode
    const currentMode = optionsRef.current.mode;
    let target: HTMLElement | null = null;
    
    if (currentMode === 'element') {
      target = targetRef.current;
      if (target) {
        target.addEventListener('mouseenter', handleMouseEnter);
        target.addEventListener('mouseleave', handleMouseLeave);
      }
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      
      if (target) {
        target.removeEventListener('mouseenter', handleMouseEnter);
        target.removeEventListener('mouseleave', handleMouseLeave);
      }
      
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      
      if (inactivityTimeoutRef.current) {
        clearInterval(inactivityTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array since all callbacks are now stable

  // Performance: Reset to 'far' when mouse hasn't moved for a while
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const timeSinceLastMove = now - lastMouseMoveTimeRef.current;
      
      if (timeSinceLastMove >= 3000 && !isHoveringRef.current) {
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
  }, []); // No dependencies since we use refs

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