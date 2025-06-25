'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';
import { Eye, Sparkles, X } from 'lucide-react';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { useReducedMotion, getMotionConfig } from '../../hooks/useReducedMotion';

interface VisionChamberProps {
  isVisible: boolean;
  userVision: string;
  onVisionUpdate: (vision: string) => void;
  confidence: number; // 0-100
  onClose?: () => void;
}

export function VisionChamber({ 
  isVisible, 
  userVision, 
  onVisionUpdate, 
  confidence,
  onClose
}: VisionChamberProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localVision, setLocalVision] = useState(userVision);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { shouldReduceMotion } = useReducedMotion();

  const handleSave = () => {
    onVisionUpdate(localVision);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalVision(userVision);
    setIsEditing(false);
  };

  const handleEscape = () => {
    if (isEditing) {
      handleCancel();
    } else if (onClose) {
      onClose();
    }
  };

  // Keyboard navigation setup
  const { containerRef } = useKeyboardNavigation({
    onEscape: handleEscape,
    onEnter: () => {
      if (isEditing && localVision.trim()) {
        handleSave();
      } else if (!isEditing) {
        setIsEditing(true);
      }
    },
    isEnabled: isVisible,
    trapFocus: true
  });

  // Focus management
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // Motion config based on user preference
  const motionConfig = getMotionConfig(shouldReduceMotion);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={containerRef as any}
          initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95, y: -10 }}
          animate={shouldReduceMotion ? {} : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95, y: -10 }}
          transition={shouldReduceMotion ? { duration: 0 } : { 
            type: "spring", 
            stiffness: 300, 
            damping: 30,
            mass: 0.8 
          }}
          className="absolute top-full left-0 right-0 mt-2 mx-4 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg z-50"
          role="dialog"
          aria-labelledby="vision-chamber-title"
          aria-describedby="vision-chamber-description"
          aria-modal="true"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-indigo-500/10 rounded-md" aria-hidden="true">
                  <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 id="vision-chamber-title" className="font-medium text-sm">Vision Chamber</h3>
                <div className="flex items-center space-x-1" role="status" aria-live="polite">
                  <Sparkles className="w-3 h-3 text-yellow-500" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground" aria-label={`Vision clarity at ${confidence} percent`}>
                    {confidence}% clarity
                  </span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm px-1"
                    aria-label="Edit your vision"
                  >
                    Edit
                  </button>
                )}
                
                {onClose && (
                  <button
                    onClick={onClose}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm"
                    aria-label="Close vision chamber"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Vision Content */}
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Your guiding purpose and long-term vision
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={localVision}
                    onChange={(e) => setLocalVision(e.target.value)}
                    placeholder="What is your vision? What drives your journey through the stars?"
                    className="w-full p-2 text-sm bg-background border border-border rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    rows={3}
                    autoFocus
                    aria-label="Your guiding purpose and long-term vision"
                    aria-describedby="vision-chamber-description"
                  />
                </div>
                
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                    aria-label="Cancel editing and discard changes"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    aria-label="Save your vision changes"
                    disabled={!localVision.trim()}
                  >
                    Save Vision
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p id="vision-chamber-description" className="text-xs text-muted-foreground mb-2">
                  Your current vision guides every navigation decision
                </p>
                
                {userVision ? (
                  <div className="p-3 bg-background/50 border border-border/50 rounded text-sm">
                    {userVision}
                  </div>
                ) : (
                  <div className="p-3 bg-muted/30 border border-dashed border-border rounded text-sm text-muted-foreground italic">
                    No vision set. Click "Edit" to define your guiding purpose.
                  </div>
                )}
                
                {/* Confidence Indicator */}
                <div className="flex items-center space-x-2 mt-2" role="progressbar" aria-valuenow={confidence} aria-valuemin={0} aria-valuemax={100} aria-label={`Vision clarity: ${confidence} percent`}>
                  <div className="flex-1 bg-muted rounded-full h-1" aria-hidden="true">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                      initial={shouldReduceMotion ? { width: `${confidence}%` } : { width: 0 }}
                      animate={{ width: `${confidence}%` }}
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">
                    Vision Clarity
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 