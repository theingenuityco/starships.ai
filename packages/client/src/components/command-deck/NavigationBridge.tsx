import { useStarshipStore } from '@/store/starship-store';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CommandDeckNavigation } from './CommandDeckNavigation';

// Fixed width (in pixels) for the navigation in its single "partial" state
const NAV_WIDTH = 280;

export function NavigationBridge() {
  const { setCommandDeckHover } = useStarshipStore();
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, width: NAV_WIDTH }}
      transition={{ duration: 0.6, when: 'beforeChildren', staggerChildren: 0.2 }}
      style={{ width: NAV_WIDTH, transformOrigin: 'left top' }}
      className="relative h-full flex flex-col bg-background/70 backdrop-blur-lg border border-border/40 shadow-xl rounded-xl overflow-hidden"
      onMouseEnter={() => setCommandDeckHover(true)}
      onMouseLeave={() => setCommandDeckHover(false)}
    >
      {/* Inner core */}
      <div className="h-full flex flex-col">
        <CommandDeckNavigation isMobile={isMobile} />
      </div>
    </motion.aside>
  );
} 