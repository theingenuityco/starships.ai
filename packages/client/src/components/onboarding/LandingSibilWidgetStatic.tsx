'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Sparkles,
  Loader2,
  AlertCircle,
  ArrowRight,
  Eye,
  Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { validateVision } from '@/lib/onboarding/validation';
import { analyzeVisionPreAuth } from '@/lib/sibil/preview-api';

interface LandingSibilWidgetStaticProps {
  onVisionSubmit?: (vision: string, analysis: any) => void;
  className?: string;
}

const VISION_EXAMPLES = [
  "I want to build the best cosmic TV in the world",
  "Create an AI-powered learning platform for kids",
  "Launch a marketplace for sustainable products",
  "Build a tool that helps developers ship faster"
];

export function LandingSibilWidgetStatic({ 
  onVisionSubmit,
  className 
}: LandingSibilWidgetStaticProps) {
  const [vision, setVision] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { saveVision } = useOnboardingSession();

  // Auto-focus textarea when component mounts
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 500);
  }, []);

  // Typewriter effect for placeholder
  useEffect(() => {
    if (vision.length > 0 || hasSubmitted) {
      // If user has typed something or submitted, stop the typewriter
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    const currentText = VISION_EXAMPLES[currentPlaceholderIndex];
    
    if (isDeleting) {
      if (displayedPlaceholder.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedPlaceholder(prev => prev.slice(0, -1));
        }, 30);
      } else {
        setIsDeleting(false);
        setCurrentPlaceholderIndex((prev) => (prev + 1) % VISION_EXAMPLES.length);
      }
    } else {
      if (displayedPlaceholder.length < currentText.length) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedPlaceholder(currentText.slice(0, displayedPlaceholder.length + 1));
        }, 50);
      } else {
        timeoutRef.current = setTimeout(() => {
          setIsDeleting(true);
        }, 2000);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [displayedPlaceholder, isDeleting, currentPlaceholderIndex, vision, hasSubmitted]);

  const handleVisionChange = (value: string) => {
    setVision(value);
    setError(null);
    if (hasSubmitted) {
      setHasSubmitted(false);
      setAnalysis(null);
    }
  };

  const handleSubmit = async () => {
    // Validate vision
    const validation = validateVision(vision);
    if (!validation.valid) {
      setError(validation.error || 'Invalid vision');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Call preview API
      const result = await analyzeVisionPreAuth(vision);
      
      setAnalysis(result.analysis);
      setHasSubmitted(true);
      
      // Save to session storage
      console.log('[LandingSibil] Saving vision to session:', vision?.slice(0, 50));
      saveVision(vision, result.analysis);
      
      // Notify parent component
      onVisionSubmit?.(vision, result.analysis);
      
    } catch (err) {
      console.error('Failed to analyze vision:', err);
      setError('Failed to analyze your vision. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (vision.trim().length >= 20 && !isAnalyzing) {
        handleSubmit();
      }
    }
  };

  return (
    <div className={cn(
      "w-full max-w-3xl mx-auto",
      className
    )}>
      <div className="space-y-6">
        {/* Main Input Area */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={vision}
            onChange={(e) => handleVisionChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={displayedPlaceholder || "What's your vision?"}
            className={cn(
              "min-h-[200px] text-lg leading-relaxed resize-none",
              "bg-background/50 backdrop-blur-sm",
              "border-2 transition-all duration-200 rounded-xl",
              "placeholder:text-muted-foreground/50",
              "pl-4 pr-14 pt-4 pb-12", // Add padding for badge and button
              vision.length > 0 ? "border-primary/30 focus:border-primary/50" : "border-border focus:border-primary/30",
              error && "border-destructive focus:border-destructive",
              hasSubmitted && "bg-muted/20"
            )}
            disabled={isAnalyzing || hasSubmitted}
            maxLength={500}
          />
          
          {/* Sibil AI Badge - bottom left with simple color */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              Sibil AI
            </span>
          </div>
          
          {/* Submit Button - inside textbox on right */}
          <Button
            onClick={handleSubmit}
            disabled={vision.length < 20 || isAnalyzing || hasSubmitted}
            size="sm"
            className={cn(
              "absolute bottom-3 right-3 rounded-lg px-3 h-8",
              "bg-primary hover:bg-primary/90 transition-all",
              vision.length >= 20 && !isAnalyzing && !hasSubmitted && "shadow-md hover:shadow-lg"
            )}
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
          </Button>
          
          {/* Character count - moved to top right corner inside */}
          <div className="absolute top-3 right-3 text-xs text-muted-foreground">
            {vision.length}/500
          </div>
        </div>

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}

        {/* Success/Analysis Display */}
        <AnimatePresence>
          {hasSubmitted && analysis && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="font-medium text-green-900 dark:text-green-100">
                      Vision captured successfully!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {analysis.summary || "Your vision has been analyzed and is ready for launch."}
                    </p>
                    {(analysis.suggestedName || analysis.recommendedClass) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {analysis.suggestedName && (
                          <Badge variant="secondary">
                            Suggested: {analysis.suggestedName}
                          </Badge>
                        )}
                        {analysis.recommendedClass && (
                          <Badge variant="secondary">
                            🛸 Cruiser Class
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Click "Create My Starship" below to continue
                </p>
                <motion.div
                  animate={{ y: [0, 5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <ArrowRight className="w-5 h-5 text-primary mx-auto rotate-90" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>


      </div>
    </div>
  );
}