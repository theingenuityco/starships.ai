'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  Loader2,
  AlertCircle,
  ArrowUp,
  ArrowRight,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { validateVision } from '@/lib/onboarding/validation';
import { analyzeVisionPreAuth } from '@/lib/sibil/preview-api';

interface LandingSibilWidgetStaticChatProps {
  onVisionSubmit?: (vision: string, analysis: any) => void;
  className?: string;
}

const VISION_EXAMPLES = [
  "I want to build the best cosmic TV in the world.",
  "I want to create an AI-powered learning platform for kids.",
  "I want to launch a marketplace for sustainable products.",
  "I want to develop a tool that helps developers ship faster."
];

interface Message {
  type: 'user' | 'sibil';
  content: string;
  analysis?: any;
}

export function LandingSibilWidgetStaticChat({ 
  onVisionSubmit,
  className 
}: LandingSibilWidgetStaticChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'sibil',
      content: "Hello, I'm Sibil. What would you like to build today?"
    }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showCreateButton, setShowCreateButton] = useState(false);
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [placeholderReady, setPlaceholderReady] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { saveVision } = useOnboardingSession();

  // Auto-focus textarea when component mounts without scrolling
  useEffect(() => {
    setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 500);
  }, []);

  // Auto-scroll to bottom within chat area only when messages change
  useEffect(() => {
    // Only scroll within the chat container, not the whole page
    const chatContainer = messagesEndRef.current?.parentElement;
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Start typewriter effect immediately
  useEffect(() => {
    if (!placeholderReady) {
      setDisplayedPlaceholder(VISION_EXAMPLES[0].slice(0, 1));
      setPlaceholderReady(true);
    }
  }, [placeholderReady]);

  // Cursor blinking effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500); // Blink every 500ms
    
    return () => clearInterval(interval);
  }, []);

  // Typewriter effect for placeholder
  useEffect(() => {
    if (inputValue.length > 0 || hasSubmitted) {
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
  }, [displayedPlaceholder, isDeleting, currentPlaceholderIndex, inputValue, hasSubmitted]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setError(null);
  };

  const handleSubmit = async () => {
    const vision = inputValue.trim();
    
    // Validate vision
    const validation = validateVision(vision);
    if (!validation.valid) {
      setError(validation.error || 'Invalid vision');
      return;
    }

    // Add user message
    setMessages([...messages, { type: 'user', content: vision }]);
    setInputValue('');
    setIsAnalyzing(true);
    setError(null);
    setHasSubmitted(true);

    try {
      // Call preview API
      const result = await analyzeVisionPreAuth(vision);
      
      // Add Sibil's responses as separate messages with delays
      const responses = [];
      
      // First response - acknowledge the vision
      if (result.analysis?.summary) {
        responses.push({
          type: 'sibil' as const,
          content: result.analysis.summary
        });
      } else {
        responses.push({
          type: 'sibil' as const,
          content: "That's an interesting vision. Let me help you bring it to life."
        });
      }
      
      // Second response - suggest name and class
      let configResponse = "";
      if (result.analysis?.suggestedName) {
        configResponse += `I recommend naming your starship "${result.analysis.suggestedName}"`;
      }
      
      // Always recommend Cruiser class - never Scout
      if (configResponse) {
        configResponse += ` and using the Cruiser class configuration`;
      } else {
        configResponse = `The Cruiser class would be ideal for your mission`;
      }
      
      if (configResponse) {
        configResponse += ".";
        responses.push({
          type: 'sibil' as const,
          content: configResponse
        });
      }
      
      // Third response - call to action
      responses.push({
        type: 'sibil' as const,
        content: "Your vision has been captured. Ready to create your starship?"
      });
      
      // Add messages with delays for natural conversation flow
      let delay = 0;
      responses.forEach((response, index) => {
        setTimeout(() => {
          setMessages(prev => [...prev, response]);
          if (index === responses.length - 1) {
            // Save after all messages are added and show create button
            saveVision(vision, result.analysis);
            onVisionSubmit?.(vision, result.analysis);
            setShowCreateButton(true);
            setIsAnalyzing(false);
          }
        }, delay);
        delay += 1200; // 1.2 second delay between messages
      });
      
    } catch (err) {
      console.error('Failed to analyze vision:', err);
      setError('Failed to analyze your vision. Please try again.');
      setMessages(prev => [...prev, { 
        type: 'sibil', 
        content: "I'm having trouble analyzing your vision right now. Please try again in a moment." 
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (inputValue.trim().length >= 20 && !isAnalyzing && !hasSubmitted) {
        handleSubmit();
      }
    }
  };

  return (
    <div className={cn(
      "w-full max-w-3xl mx-auto",
      className
    )}>
      <div className="space-y-0">
        {/* Chat Container */}
        <div className="bg-background/50 backdrop-blur-sm border-2 border-border rounded-t-xl">
          {/* Chat Header */}
          <div className="border-b border-border/50 px-6 py-3 flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-base">Sibil AI</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          
          {/* Chat Messages Area */}
          <div className="p-6 h-[250px] overflow-y-auto space-y-4 scroll-smooth">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index === 0 ? 0.3 : 0 }}
                  className={cn(
                    "flex gap-3",
                    message.type === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {message.type === 'sibil' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <Bot className="w-5 h-5 text-emerald-500" />
                      </div>
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-5 py-3 shadow-sm",
                    message.type === 'user' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-white/5 backdrop-blur-sm border border-border/50"
                  )}>
                    <p className={cn(
                      "whitespace-pre-line",
                      message.type === 'user' ? "text-sm" : "text-sm"
                    )}>{message.content}</p>
                  </div>
                  {message.type === 'user' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center border border-border">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3"
              >
                <div className="flex-shrink-0 mt-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Bot className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                </div>
                <div className="bg-white/5 backdrop-blur-sm border border-border/50 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Analyzing your vision...</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - Connected to Chat */}
        <div className="relative border-2 border-t-0 border-border rounded-b-xl bg-background/50 backdrop-blur-sm">
          {/* Fake placeholder with glow effect */}
          {!inputValue && !hasSubmitted && (
            <div 
              className="absolute inset-0 flex items-center pl-4 pr-16 pointer-events-none"
              style={{
                textShadow: '0 0 15px rgba(255, 255, 255, 0.6), 0 0 25px rgba(59, 130, 246, 0.4), 0 0 35px rgba(59, 130, 246, 0.3)'
              }}
            >
              <span className="text-base text-white/45 font-light">
                {displayedPlaceholder}{showCursor ? '|' : ''}
              </span>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder=""
            className={cn(
              "min-h-[54px] h-[54px] text-base resize-none relative flex items-center",
              "bg-transparent border-0 focus:ring-0 focus:outline-none",
              "pl-4 pr-16 py-4",
              hasSubmitted && "opacity-50"
            )}
            style={{ lineHeight: '22px' }}
            disabled={isAnalyzing || hasSubmitted}
            maxLength={500}
          />
          
          {/* Submit Button or Create Starship Button */}
          {showCreateButton ? (
            <div className="absolute top-1/2 -translate-y-1/2 right-2">
              {/* Subtle glow effect */}
              <motion.div
                className="absolute inset-0 rounded-full bg-primary blur-xl"
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0.2, 0.35, 0.2],
                }}
                transition={{ 
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              {/* Button */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  scale: [1, 1.1, 1, 1.1, 1, 1, 1, 1, 1, 1, 1, 1]
                }}
                transition={{ 
                  opacity: { duration: 0.3 },
                  scale: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.075, 0.15, 0.225, 0.3, 0.375, 0.45, 0.6, 0.75, 0.9, 0.95, 1]
                  }
                }}
              >
                <Button
                  onClick={() => window.location.href = '/login'}
                  className="relative rounded-full px-4 py-2 h-auto bg-primary hover:bg-primary/90 transition-all flex items-center justify-center gap-1"
                  style={{
                    boxShadow: "0 4px 20px rgba(59, 130, 246, 0.5), 0 2px 10px rgba(59, 130, 246, 0.3)"
                  }}
                >
                  <span className="text-sm font-medium">Create Starship</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </div>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={inputValue.length < 20 || isAnalyzing || hasSubmitted}
              size="sm"
              className={cn(
                "absolute top-1/2 -translate-y-1/2 right-2 rounded-full px-2 h-8 w-8",
                "bg-primary hover:bg-primary/90 transition-all",
                inputValue.length >= 20 && !isAnalyzing && !hasSubmitted && "shadow-md hover:shadow-lg"
              )}
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </Button>
          )}
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
      </div>
    </div>
  );
}