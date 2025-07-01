'use client';

import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { NavigationBridge } from '@/components/command-deck/NavigationBridge';
import { AuthGate } from '@/components/auth/AuthGate';
import { useStarshipStore } from '@/store/starship-store';
import { useCommandDeckKeyboard } from '@/hooks/useCommandDeckKeyboard';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClientLayoutProps {
  children: React.ReactNode;
}

// Enhanced animation variants
const dashboardVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.05 }
};

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen command-deck-bg">
    <motion.div
      className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  </div>
);

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const { commandDeck, expandCommandDeck } = useStarshipStore();
  const { isAuthenticated, isLoading } = useAuth();
  const isDashboard = pathname === '/';
  
  // Enable keyboard shortcuts only for authenticated users
  useCommandDeckKeyboard();

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isDashboard) {
    // Landing page route - no CommandDeck, no authentication required
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Regular pages with command deck overlay
  return (
    <AuthGate>
      <div className="h-screen flex relative overflow-hidden">
        {/* Command Deck with gutter (16px) */}
        <div className="fixed top-4 left-4 z-50 w-[280px] h-[calc(100vh-32px)]">
          <NavigationBridge />
        </div>
        
        {/* Mobile Toggle Button (only shown when CommandDeck is hidden on mobile) */}
        {isMobile && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={expandCommandDeck}
            className="fixed top-4 left-4 z-50 p-3 bg-card border border-border rounded-lg shadow-lg hover:bg-accent transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </motion.button>
        )}
        
        {/* Main Content Area - Always maintains position */}
        <AnimatePresence mode="wait">
          <motion.main 
            key={pathname}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={cn(
              "flex-1 min-h-full w-full transition-all duration-300 pl-[296px]"
            )}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </AuthGate>
  );
} 