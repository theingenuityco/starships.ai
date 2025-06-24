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

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useStarship } from '@/components/state/starship-context';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ThemeToggle } from '@/components/theme-toggle';
import { 
  Rocket, 
  Users, 
  Brain, 
  Zap, 
  BookOpen, 
  Eye,
  Settings,
  Menu,
  X
} from 'lucide-react';

const navItems = [
  { href: '/crew', label: 'Crew Console', icon: Users, emoji: '👥', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { href: '/core', label: 'Aether Core', icon: Brain, emoji: '🧠', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { href: '/expeditions', label: 'Expeditions', icon: Rocket, emoji: '🚀', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { href: '/drive', label: 'Aether Drive', icon: Zap, emoji: '🔋', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  { href: '/logbook', label: 'Logbook', icon: BookOpen, emoji: '📚', color: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  { href: '/sibil', label: 'Sibil', icon: Eye, emoji: '👁️', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
];

export function CommandDeck() {
  const pathname = usePathname();
  const { state } = useStarship();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Get current page info for route-specific styling
  const currentPage = navItems.find(item => item.href === pathname);
  const isCrewPage = pathname === '/crew';

  // TODO: Add keyboard event handlers for accessibility
  // const handleKeyDown = (event: KeyboardEvent) => { ... }

  // TODO: Add focus management for mobile menu
  // const focusableElements = useRef<HTMLElement[]>([]);

  return (
    <>
      {/* TODO: Add role="navigation" and aria-label */}
      <motion.nav
        className={`bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4 transition-all duration-300 ${
          currentPage ? `${currentPage.color} bg-opacity-5` : ''
        }`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        // TODO: Add accessibility attributes
        // role="navigation"
        // aria-label="Main navigation"
      >
        <div className="flex items-center justify-between">
          {/* Left: Starship Brand + Current Page */}
          <div className="flex items-center space-x-3 sm:space-x-6 min-w-0">
            {/* TODO: Add aria-label for logo link */}
            <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-primary-foreground text-xs sm:text-sm font-bold">🛸</span>
              </div>
              <span className="text-base sm:text-lg font-semibold hidden xs:block">Starships</span>
            </Link>

            {pathname !== '/' && currentPage && (
              <motion.div 
                className="flex items-center space-x-2 min-w-0"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                // TODO: Add aria-live for route changes
                // aria-live="polite"
                // aria-label={`Current page: ${currentPage.label}`}
              >
                <span className="text-muted-foreground hidden sm:block">•</span>
                <div className={`p-1 sm:p-2 rounded-lg ${currentPage.color}`}>
                  <span className="text-sm sm:text-lg">{currentPage.emoji}</span>
                </div>
                <div className="min-w-0">
                  <span className="font-medium text-sm sm:text-base truncate">{currentPage.label}</span>
                  {isCrewPage && (
                    <div className="text-xs text-muted-foreground hidden sm:block">
                      Active Communication Hub
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Center: Navigation Links (desktop only) */}
          {pathname !== '/' && (
            <div className="hidden lg:flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <motion.div
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                        isActive 
                          ? `bg-primary text-primary-foreground shadow-md` 
                          : `text-muted-foreground hover:text-foreground hover:bg-accent ${item.color} hover:bg-opacity-50`
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      // TODO: Add accessibility attributes
                      // aria-current={isActive ? 'page' : undefined}
                      // aria-label={`${item.label} ${isActive ? '(current page)' : ''}`}
                    >
                      <span className="mr-2">{item.emoji}</span>
                      {item.label}
                      {isActive && (
                        <motion.div
                          className="absolute -bottom-1 left-1/2 w-1 h-1 bg-primary-foreground rounded-full"
                          layoutId="navbar-indicator"
                          style={{ x: '-50%' }}
                        />
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right: Controls */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Mobile Menu Button */}
            <motion.button
              className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              // TODO: Add accessibility attributes
              // aria-expanded={mobileMenuOpen}
              // aria-controls="mobile-navigation"
              // aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </motion.button>

            {/* Sibil Companion Button */}
            <Link href="/sibil" className="hidden sm:block">
              <motion.div
                className="flex items-center space-x-2 px-2 sm:px-3 py-2 rounded-md bg-accent hover:bg-accent/80 transition-colors relative"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                // TODO: Add aria-label describing the insights count
                // aria-label={`Sibil companion ${state.sibilInsights > 0 ? `with ${state.sibilInsights} insights` : ''}`}
              >
                <span className="text-sm">👁️</span>
                <span className="text-sm font-medium hidden md:block">Sibil</span>
                {state.sibilInsights > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Badge variant="secondary" className="text-xs h-5 w-5 p-0 flex items-center justify-center">
                      {state.sibilInsights}
                    </Badge>
                  </motion.div>
                )}
              </motion.div>
            </Link>

            {/* Power Level with responsive sizing */}
            <div className="hidden md:flex items-center space-x-2">
              <span className="text-sm">🔋</span>
              <div className="relative">
                {/* TODO: Add aria-label for progress bar */}
                <Progress 
                  value={state.powerLevel} 
                  className="w-12 sm:w-16 h-2"
                  // aria-label={`Aether drive power level: ${state.powerLevel}%`}
                />
                <motion.div
                  className="absolute top-0 left-0 h-2 bg-gradient-to-r from-primary to-primary/60 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${state.powerLevel}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8">
                {state.powerLevel}%
              </span>
            </div>

            {/* Starship Class with responsive display */}
            <motion.div
              animate={{ 
                boxShadow: state.powerLevel > 75 
                  ? "0 0 10px rgba(59, 130, 246, 0.3)" 
                  : "none" 
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
              className="hidden sm:block"
              // TODO: Add aria-label for starship class
              // aria-label={`Starship class: ${state.class}`}
            >
              <Badge variant="outline" className="capitalize">
                <span className="mr-1">⚡</span>
                {state.class}
              </Badge>
            </motion.div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Settings (desktop only) */}
            <motion.button
              className="hidden sm:block p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.2 }}
              // TODO: Add aria-label for settings button
              // aria-label="Open settings"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Mobile Status Bar */}
        <div className="mt-3 pt-3 border-t border-border sm:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <span className="text-xs">🔋</span>
                <Progress value={state.powerLevel} className="w-8 h-1" />
                <span className="text-xs text-muted-foreground">{state.powerLevel}%</span>
              </div>
              <Badge variant="outline" className="capitalize text-xs">
                <span className="mr-1">⚡</span>
                {state.class}
              </Badge>
            </div>
            <Link href="/sibil">
              <div className="flex items-center space-x-1 px-2 py-1 rounded bg-accent relative">
                <span className="text-xs">👁️</span>
                {state.sibilInsights > 0 && (
                  <Badge variant="secondary" className="text-xs h-4 w-4 p-0 flex items-center justify-center">
                    {state.sibilInsights}
                  </Badge>
                )}
              </div>
            </Link>
          </div>
        </div>

        {/* Desktop Mission Bar */}
        {pathname !== '/' && state.currentMission && (
          <motion.div 
            className="mt-3 pt-3 border-t border-border hidden sm:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            // TODO: Add aria-live for mission updates
            // aria-live="polite"
            // aria-label="Current mission status"
          >
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <span>🎯</span>
                <span className="truncate">{state.currentMission}</span>
                {isCrewPage && (
                  <Badge variant="outline" className="text-xs ml-2">
                    Communication Active
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground flex items-center space-x-4">
                <span>{state.activeExpeditions} Active Expeditions</span>
                {currentPage && (
                  <div className={`px-2 py-1 rounded ${currentPage.color} text-xs hidden lg:block`}>
                    {currentPage.label}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            // TODO: Add accessibility attributes for modal
            // role="dialog"
            // aria-modal="true"
            // aria-labelledby="mobile-menu-title"
          >
            <motion.div
              className="absolute top-16 left-4 right-4 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              // TODO: Add id for aria-labelledby
              // id="mobile-navigation"
            >
              <div className="p-4 space-y-2">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <div className={`flex items-center space-x-3 px-3 py-3 rounded-md transition-colors ${
                        isActive 
                          ? 'bg-primary text-primary-foreground' 
                          : `text-muted-foreground hover:text-foreground hover:bg-accent ${item.color} hover:bg-opacity-50`
                      }`}>
                        <div className={`p-2 rounded-lg ${item.color}`}>
                          <span className="text-lg">{item.emoji}</span>
                        </div>
                        <div>
                          <span className="font-medium">{item.label}</span>
                          {item.href === '/crew' && (
                            <div className="text-xs text-muted-foreground">
                              Communication Hub
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              
              {/* Mobile Mission Info */}
              {state.currentMission && (
                <div className="px-4 pb-4 pt-2 border-t border-border">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>🎯</span>
                    <span className="truncate">{state.currentMission}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {state.activeExpeditions} Active Expeditions
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
} 