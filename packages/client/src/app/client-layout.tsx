'use client';

import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { CommandDeck } from '@/components/command-deck/CommandDeck';
import { useStarship } from '@/components/state/starship-context';

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
  const { isLoading } = useStarship();
  const isDashboard = pathname === '/';

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isDashboard) {
    // Dashboard page - full screen with enhanced transitions
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="dashboard"
          variants={dashboardVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="min-h-screen"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Regular pages - with CommandDeck navbar and enhanced transitions
  return (
    <div className="flex flex-col h-screen">
      <CommandDeck />
      <AnimatePresence mode="wait">
        <motion.main 
          key={pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="flex-1 overflow-hidden"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  );
} 