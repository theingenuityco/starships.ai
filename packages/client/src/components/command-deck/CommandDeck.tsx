'use client';

/*
 * COMMAND DECK NAVIGATION COMPONENT
 * =================================
 * 
 * ACCESSIBILITY TODOS - PHASE 4 FUTURE ENHANCEMENTS:
 * 
 * 1. KEYBOARD NAVIGATION:
 *    - TODO: Add arrow key navigation for menu items
 *    - TODO: Implement proper focus management for mobile menu
 *    - TODO: Add keyboard shortcuts (Alt+C for crew, Alt+E for expeditions, etc.)
 *    - TODO: Ensure proper tab order and focus indicators
 * 
 * 2. SCREEN READER SUPPORT:
 *    - TODO: Add proper ARIA labels for all interactive elements
 *    - TODO: Implement live regions for dynamic content updates
 *    - TODO: Add role="navigation" and aria-label for main nav
 *    - TODO: Provide context for route changes to screen readers
 * 
 * 3. REDUCED MOTION SUPPORT:
 *    - TODO: Respect prefers-reduced-motion for animations
 *    - TODO: Provide non-animated alternatives for essential info
 *    - TODO: Add motion toggle in settings
 * 
 * 4. HIGH CONTRAST MODE:
 *    - TODO: Test and enhance Windows High Contrast mode compatibility
 *    - TODO: Ensure sufficient color contrast ratios (WCAG AA)
 *    - TODO: Add forced-colors media query support
 * 
 * 5. MOBILE ACCESSIBILITY:
 *    - TODO: Ensure touch targets meet 44px minimum size
 *    - TODO: Add haptic feedback for mobile interactions
 *    - TODO: Test with mobile screen readers (VoiceOver, TalkBack)
 */

import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { useProximityDetection } from '@/hooks/useProximityDetection';
import { CommandDeckNavigation } from './CommandDeckNavigation';
import { CommandDeckDashboard } from './CommandDeckDashboard';
import { useEffect, useRef, useState } from 'react';

export function CommandDeck() {
  const { 
    commandDeck, 
    setCommandDeckVisibility, 
    updateProximityState,
            expandCommandDeck,
        collapseCommandDeck,
    setCommandDeckFocus,
    setCommandDeckHover
  } = useStarshipStore();

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Left edge proximity detection
  const { proximityState } = useProximityDetection({
    nearThreshold: 150,
    engageThreshold: 75,
    debounceMs: 100,
    mode: 'left-edge'
  });

  // Ref for the command deck element
  const commandDeckRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const isClickingRef = useRef(false);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle proximity state changes for auto-expand
  useEffect(() => {
    if (!isMobile && proximityState === 'engaged' && commandDeck.visibility === 'collapsed') {
      setCommandDeckVisibility('partial');
    }
  }, [proximityState, commandDeck.visibility, isMobile, setCommandDeckVisibility]);

  // Clear any pending collapse timeout
  const clearCollapseTimeout = () => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  };

  // Handle hover state changes
  const handleMouseEnter = () => {
    if (!isMobile && !isClickingRef.current) {
      isHoveredRef.current = true;
      setCommandDeckHover(true);
      clearCollapseTimeout();
      if (commandDeck.visibility === 'collapsed') {
        setCommandDeckVisibility('partial');
      }
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      isHoveredRef.current = false;
      setCommandDeckHover(false);
      clearCollapseTimeout();
      
      // Schedule collapse check regardless of current visibility
      // This ensures we always try to collapse when leaving hover area
      collapseTimeoutRef.current = setTimeout(() => {
        // Get fresh state at execution time
        const currentState = useStarshipStore.getState();
        const currentVisibility = currentState.commandDeck.visibility;
        
        // Only collapse if:
        // 1. Not currently clicking
        // 2. Still not hovered (double check)
        // 3. In partial state (hover-expanded, not manually expanded)
        if (!isClickingRef.current && 
            !isHoveredRef.current && 
            currentVisibility === 'partial') {
          setCommandDeckVisibility('collapsed');
        }
      }, 200);
    }
  };

  // Handle click interactions to prevent hover interference
  const handleMouseDown = () => {
    isClickingRef.current = true;
    clearCollapseTimeout();
  };

  const handleMouseUp = () => {
    // Reset click state after a short delay to allow click handlers to complete
    setTimeout(() => {
      isClickingRef.current = false;
    }, 100);
  };

  // Add click handler to prevent event bubbling issues
  const handleClick = (e: React.MouseEvent) => {
    // Don't interfere with button clicks inside the navigation
    if ((e.target as HTMLElement).closest('button')) {
      clearCollapseTimeout();
    }
  };

  // Wrapped expand/collapse functions that clear timeouts
  const handleExpandCommandDeck = () => {
    clearCollapseTimeout();
    isClickingRef.current = true;
    expandCommandDeck();
    setTimeout(() => {
      isClickingRef.current = false;
    }, 200);
  };

  const handleCollapseCommandDeck = () => {
    clearCollapseTimeout();
    isClickingRef.current = true;
    collapseCommandDeck();
    setTimeout(() => {
      isClickingRef.current = false;
    }, 200);
  };

  // Periodic check to ensure navigation doesn't get stuck
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only run this check if we're not on mobile and not currently hovering
      if (!isMobile && !isHoveredRef.current && !isClickingRef.current) {
        const currentState = useStarshipStore.getState();
        // If we're in partial state but not hovered, collapse it
        if (currentState.commandDeck.visibility === 'partial') {
          // Check if the element is actually being hovered by DOM state
          const element = commandDeckRef.current;
          if (element && !element.matches(':hover')) {
            setCommandDeckVisibility('collapsed');
          }
        }
      }
    }, 1000); // Check every second

    return () => {
      clearInterval(intervalId);
    };
  }, [isMobile, setCommandDeckVisibility]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCollapseTimeout();
    };
  }, []);



  // Animation variants
  const mobileVariants = {
    hidden: {
      x: '-100%',
      width: '100vw',
      opacity: 0
    },
    expanded: {
      x: '0%',
      width: '100vw',
      opacity: 1
    }
  };

  const desktopVariants = {
    collapsed: {
      x: '0%',
      width: '64px',
      opacity: 1
    },
    partial: {
      x: '0%',
      width: '280px', // Reduced from 320px to prevent overflow
      opacity: 1
    },
    expanded: {
      x: '0%',
      width: '100vw',
      opacity: 1
    }
  };

  const commandDeckVariants = isMobile ? mobileVariants : desktopVariants;

  // Get current visibility state (adjust for mobile)
  const currentVisibility = isMobile 
    ? (commandDeck.visibility === 'expanded' ? 'expanded' : 'hidden')
    : commandDeck.visibility;

  return (
    <motion.div
      ref={commandDeckRef}
      className="fixed left-0 top-0 h-full bg-card border-r border-border z-40 flex"
      initial={isMobile ? "hidden" : "collapsed"}
      animate={currentVisibility}
      variants={commandDeckVariants}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        duration: 0.3
      }}
      onMouseEnter={!isMobile ? handleMouseEnter : undefined}
      onMouseLeave={!isMobile ? handleMouseLeave : undefined}
      onMouseDown={!isMobile ? handleMouseDown : undefined}
      onMouseUp={!isMobile ? handleMouseUp : undefined}
      onClick={!isMobile ? handleClick : undefined}
    >
      {/* Left: Navigation & Quick Controls */}
      <div className={`${isMobile ? 'w-full' : 'w-full max-w-[280px]'} flex-shrink-0 h-full overflow-hidden`}>
        <CommandDeckNavigation 
          visibility={commandDeck.visibility}
          onExpand={handleExpandCommandDeck}
          onCollapse={handleCollapseCommandDeck}
          isMobile={isMobile}
        />
      </div>

      {/* Right: Full Dashboard (Only when expanded on desktop) */}
      {!isMobile && commandDeck.visibility === 'expanded' && (
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 h-full bg-background/95 backdrop-blur-sm"
        >
          <CommandDeckDashboard onCollapse={handleCollapseCommandDeck} />
        </motion.div>
      )}
    </motion.div>
  );
} 