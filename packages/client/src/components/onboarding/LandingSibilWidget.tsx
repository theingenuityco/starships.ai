'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Bot, 
  Minimize2, 
  Maximize2, 
  Send, 
  Sparkles,
  ChevronDown,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { validateVision } from '@/lib/onboarding/validation';
import { analyzeVisionPreAuth } from '@/lib/sibil/preview-api';

interface LandingSibilWidgetProps {
  onVisionSubmit?: (vision: string, analysis: any) => void;
  className?: string;
}

type WidgetState = 
  | 'greeting'      // Initial prompt
  | 'listening'     // User typing
  | 'analyzing'     // Processing vision
  | 'responding'    // Showing response
  | 'ready'         // Ready to proceed
  | 'error'         // Error state
  | 'minimized';    // Collapsed view

const EXAMPLE_VISIONS = [
  "I want to build the best cosmic TV in the world",
  "Create an AI-powered learning platform for kids",
  "Launch a marketplace for sustainable products",
  "Build a tool that helps developers ship faster"
];

export function LandingSibilWidget({ 
  onVisionSubmit,
  className 
}: LandingSibilWidgetProps) {
  const [state, setState] = useState<WidgetState>('greeting');
  const [vision, setVision] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { saveVision } = useOnboardingSession();

  // Auto-focus textarea when widget appears
  useEffect(() => {
    if (state === 'greeting' && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 800);
    }
  }, [state]);

  const handleVisionChange = (value: string) => {
    setVision(value);
    setError(null);
    if (value.length > 0 && state === 'greeting') {
      setState('listening');
    } else if (value.length === 0) {
      setState('greeting');
    }
  };

  const handleExampleClick = (example: string) => {
    setVision(example);
    setState('listening');
    setShowExamples(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    // Validate vision
    const validation = validateVision(vision);
    if (!validation.valid) {
      setError(validation.error || 'Invalid vision');
      return;
    }

    setState('analyzing');
    setError(null);

    try {
      // Call preview API
      const result = await analyzeVisionPreAuth(vision);
      
      setAnalysis(result.analysis);
      setState('responding');
      
      // Save to session storage
      console.log('[LandingSibil] Saving vision to session:', vision?.slice(0, 50));
      saveVision(vision, result.analysis);
      
      // Show response for 2 seconds then transition to ready
      setTimeout(() => {
        setState('ready');
        // Notify parent component
        onVisionSubmit?.(vision, result.analysis);
      }, 2000);
      
    } catch (err) {
      console.error('Failed to analyze vision:', err);
      setError('Failed to analyze your vision. Please try again.');
      setState('error');
    }
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (vision.trim().length >= 20) {
        handleSubmit();
      }
    }
  };

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={cn(
          "fixed bottom-4 right-4 z-50",
          className
        )}
      >
        <Button
          onClick={handleMinimize}
          className="rounded-full shadow-lg bg-primary/90 hover:bg-primary"
          size="lg"
        >
          <Bot className="w-5 h-5 mr-2" />
          Sibil AI
          <Maximize2 className="w-4 h-4 ml-2" />
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ 
        delay: 2, 
        duration: 0.5, 
        ease: "easeOut",
        type: "spring",
        stiffness: 100
      }}
      className={cn(
        "fixed right-4 top-24 z-50 w-[400px] max-w-[90vw]",
        className
      )}
    >
      <Card className="bg-background/95 backdrop-blur-xl border-primary/20 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Bot className="w-6 h-6 text-primary" />
              {state === 'analyzing' && (
                <motion.div
                  className="absolute inset-0"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-6 h-6 text-primary/50" />
                </motion.div>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Sibil AI</h3>
              <p className="text-xs text-muted-foreground">Your Vision Guide</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMinimize}
            className="hover:bg-primary/10"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Greeting/Response */}
          <AnimatePresence mode="wait">
            {state === 'greeting' && (
              <motion.div
                key="greeting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-2"
              >
                <p className="text-lg font-medium">What&apos;s your vision?</p>
                <p className="text-sm text-muted-foreground">
                  Tell me what you want to build, and I&apos;ll help you launch your starship...
                </p>
              </motion.div>
            )}

            {state === 'analyzing' && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center space-x-2"
              >
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <p className="text-sm">Analyzing your vision...</p>
              </motion.div>
            )}

            {state === 'responding' && analysis && (
              <motion.div
                key="responding"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-2"
              >
                <div className="flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Awesome! I can see it now...</p>
                    <p className="text-sm text-muted-foreground">
                      {analysis.summary || `To help you achieve "${vision.substring(0, 50)}...", let's create your starship!`}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {state === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-3"
              >
                <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                  <p className="text-sm font-medium text-primary">Vision Captured!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &quot;Create My Starship&quot; below to begin your journey
                  </p>
                </div>
                <motion.div
                  animate={{ y: [0, 3, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <ChevronDown className="w-5 h-5 text-primary mx-auto" />
                </motion.div>
              </motion.div>
            )}

            {state === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start space-x-2 text-destructive"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          {state !== 'ready' && (
            <div className="space-y-2">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={vision}
                  onChange={(e) => handleVisionChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your vision here..."
                  className={cn(
                    "min-h-[80px] resize-none pr-10",
                    "bg-background/50 border-border/50",
                    "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
                    error && "border-destructive focus:border-destructive"
                  )}
                  disabled={state === 'analyzing'}
                  maxLength={500}
                />
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                  {vision.length}/500
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-xs text-destructive flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExamples(!showExamples)}
                  className="text-xs"
                >
                  {showExamples ? 'Hide' : 'Show'} Examples
                  <ChevronDown className={cn(
                    "w-3 h-3 ml-1 transition-transform",
                    showExamples && "rotate-180"
                  )} />
                </Button>

                <Button
                  onClick={handleSubmit}
                  disabled={vision.length < 20 || state === 'analyzing'}
                  size="sm"
                  className="bg-primary hover:bg-primary/90"
                >
                  {state === 'analyzing' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Send
                      <Send className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              {/* Examples dropdown */}
              <AnimatePresence>
                {showExamples && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1 overflow-hidden"
                  >
                    {EXAMPLE_VISIONS.map((example, i) => (
                      <button
                        key={i}
                        onClick={() => handleExampleClick(example)}
                        className="w-full text-left text-xs p-2 rounded hover:bg-primary/10 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        • {example}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}