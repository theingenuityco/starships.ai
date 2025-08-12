'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { 
  Bot,
  ArrowRight,
  User,
  Rocket
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface LandingSibilWidgetAuthenticatedProps {
  userName?: string;
  className?: string;
}

const GREETING_PHRASES = [
  "busy day, isn't it?",
  "not all days are the same",
  "ready to make magic happen?",
  "the universe is waiting",
  "time to build something amazing",
  "let's turn ideas into reality"
];

interface Message {
  type: 'user' | 'sibil';
  content: string;
  displayContent?: string;
}

export function LandingSibilWidgetAuthenticated({ 
  userName = 'there',
  className 
}: LandingSibilWidgetAuthenticatedProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  
  // Get a random greeting phrase
  const [greetingPhrase] = useState(() => {
    const randomIndex = Math.floor(Math.random() * GREETING_PHRASES.length);
    return GREETING_PHRASES[randomIndex];
  });

  const fullMessage = `Hey ${userName}, ${greetingPhrase}. Let's continue where we left off!`;

  const [messages] = useState<Message[]>([
    {
      type: 'sibil',
      content: fullMessage,
      displayContent: ''
    }
  ]);

  // Typing animation effect
  useEffect(() => {
    let currentIndex = 0;
    const typingSpeed = 30; // milliseconds per character
    
    const typeNextChar = () => {
      if (currentIndex < fullMessage.length) {
        setDisplayedText(fullMessage.substring(0, currentIndex + 1));
        currentIndex++;
        setTimeout(typeNextChar, typingSpeed);
      } else {
        setIsTyping(false);
      }
    };

    // Start typing after a small delay
    const startDelay = setTimeout(() => {
      typeNextChar();
    }, 500);

    return () => clearTimeout(startDelay);
  }, [fullMessage]);

  const handleEnterCommandDeck = () => {
    router.push('/fleet');
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
          <div className="p-6 h-[180px] overflow-y-auto space-y-4 scroll-smooth">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: 0.3 }}
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
                    )}>
                      {displayedText}
                      {isTyping && <span className="animate-pulse">|</span>}
                    </p>
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
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area with Enter Command Deck Button */}
        <div className="relative border-2 border-t-0 border-border rounded-b-xl bg-background/50 backdrop-blur-sm">
          <div className="h-[54px] flex items-center justify-end px-4">
            {/* Enter Command Deck Button - Right aligned */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                scale: 1
              }}
              transition={{ 
                duration: 0.3,
                delay: 0.5
              }}
              className="relative"
            >
              <Button
                onClick={handleEnterCommandDeck}
                className="rounded-full px-5 py-2 h-auto bg-primary hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                style={{
                  boxShadow: "0 2px 10px rgba(59, 130, 246, 0.25)"
                }}
              >
                <Rocket className="w-4 h-4" />
                <span className="text-sm font-medium">Command Deck</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}