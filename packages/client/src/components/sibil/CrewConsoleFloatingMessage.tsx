'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CrewConsoleFloatingMessageProps {
  show: boolean;
  onDismiss?: () => void;
  isManualOpen?: boolean;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function CrewConsoleFloatingMessage({ 
  show, 
  onDismiss, 
  isManualOpen = false,
  currentTab,
  onTabChange
}: CrewConsoleFloatingMessageProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [hasBeenDismissed, setHasBeenDismissed] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Debug effect to monitor currentStep changes
  useEffect(() => {
    console.log('currentStep changed to:', currentStep);
  }, [currentStep]);

  useEffect(() => {
    // Reset initialization flag when modal is hidden
    if (!show) {
      setHasInitialized(false);
      setCurrentStep(1);
      return;
    }

    // If manually opened and not yet initialized
    if (isManualOpen && show && !hasInitialized) {
      setIsVisible(true);
      setCurrentStep(1);
      setHasInitialized(true);
      // Navigate to AI Agents tab when manually opened
      onTabChange('agents');
      return;
    }

    // Check if message has been dismissed before (only for auto-show)
    const dismissed = localStorage.getItem('crew-console-message-dismissed');
    if (dismissed && !isManualOpen) {
      setHasBeenDismissed(true);
      return;
    }

    if (show && !hasBeenDismissed && !isManualOpen && !hasInitialized) {
      // Show message immediately without delay
      setIsVisible(true);
      setCurrentStep(1);
      setHasInitialized(true);
      // Navigate to AI Agents tab for first step
      onTabChange('agents');
    }
  }, [show, hasBeenDismissed, isManualOpen, onTabChange, hasInitialized]);

  const handleNextStep = () => {
    console.log('Current step before:', currentStep);
    setCurrentStep(prevStep => {
      console.log('Updating step from', prevStep, 'to', 2);
      return 2;
    });
    // Navigate to Tools tab instead of Connectors (which is hidden)
    onTabChange('api-keys');
    console.log('Called onTabChange with api-keys');
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setHasBeenDismissed(true);
    setCurrentStep(1);
    // Only save dismissed state if it was auto-shown (not manual)
    if (!isManualOpen) {
      localStorage.setItem('crew-console-message-dismissed', 'true');
    }
    onDismiss?.();
  };


  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop blur overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-background/30 backdrop-blur-[1px] z-30"
            onClick={handleDismiss}
          />
          
          {/* Message box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ 
              type: "spring",
              stiffness: 260,
              damping: 20,
              duration: 0.5 
            }}
            className="fixed top-[20%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-40 max-w-md"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
            
            {/* Main container */}
            <div className="relative bg-gradient-to-br from-background/95 via-background/90 to-background/95 backdrop-blur-xl rounded-2xl border border-emerald-500/30 shadow-2xl overflow-hidden">
              {/* Animated border gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 animate-pulse" />

              <div className="relative p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* Simple icon container without animations */}
                    <div className="relative bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 p-2.5 rounded-full">
                      <Bot className="w-5 h-5 text-emerald-500" />
                      {/* Simple blinking green dot */}
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        {currentStep === 1 ? 'AI Agents' : 'Tools'}
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        >
                          <Sparkles className="w-3 h-3 text-emerald-500" />
                        </motion.div>
                      </h3>
                      <p className="text-xs text-muted-foreground">Step {currentStep}/2</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleDismiss}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-white/10 -mr-2 -mt-2"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                {/* Message content */}
                <div className="space-y-3" key={`content-${currentStep}`}>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {currentStep === 1 
                      ? 'Create powerful AI agents from templates to automate your workflows.'
                      : 'Configure API keys for external tools to enhance your agents capabilities.'}
                  </p>
                  
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {currentStep === 1
                      ? 'Each agent is specialized for specific tasks like code reviews, documentation, or testing.'
                      : 'Add tools like Brave Search, Firecrawl, and more to power your AI agents.'}
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center justify-start pt-3">
                    {currentStep === 1 ? (
                      <Button
                        onClick={() => {
                          console.log('Next button clicked, currentStep is:', currentStep);
                          handleNextStep();
                        }}
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        Next
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleDismiss}
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        Got it!
                      </Button>
                    )}
                  </div>
                </div>

                {/* Decorative elements */}
                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
                <div className="absolute -top-4 -left-4 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl" />
              </div>
            </div>

            {/* Arrow pointing to left */}
            <motion.div
              className="absolute top-1/2 -left-14 -translate-y-1/2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <svg width="60" height="40" viewBox="0 0 60 40" className="transform rotate-180">
                <motion.path
                  d="M 10 20 L 50 20 M 40 10 L 50 20 L 40 30"
                  stroke="url(#emerald-arrow-gradient-crew)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray="4 4"
                  animate={{
                    strokeDashoffset: [0, -8],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                />
                <defs>
                  <linearGradient id="emerald-arrow-gradient-crew" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="rgb(16 185 129)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}