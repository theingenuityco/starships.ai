'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Minimize2, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SibilMessage, sibilAPI } from '@/lib/sibil-api';
import { getChatHistory, saveChatHistory, generateSibilSessionId } from '@/lib/storage';
import { useAuth } from '@/hooks/useAuth';
import { useStarshipStore } from '@/store/starship-store';
import { usePathname } from 'next/navigation';
import { SibilMessageBubble } from './SibilMessageBubble';

interface SibilChatWidgetProps {
  starshipId?: string;
  isFirstStarship?: boolean;
}

export function SibilChatWidget({ starshipId, isFirstStarship = false }: SibilChatWidgetProps) {
  const { userId, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<SibilMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [streaming, setStreaming] = useState(false);
  const sessionId = useRef<string>('sibil-widget-session');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamController = useRef<{ abort: () => void } | null>(null);

  // Determine if this is the user's first visit to vision-chamber
  const isVisionChamberFirstVisit = pathname?.includes('/vision-chamber') && isFirstStarship;

  // Initialize session and onboarding messages
  useEffect(() => {
    if (userId && isAuthenticated && starshipId) {
      const newSessionId = generateSibilSessionId(userId, starshipId + '-widget');
      sessionId.current = newSessionId;
      
      // Load existing messages
      const storedMessages = getChatHistory(newSessionId) as SibilMessage[];
      
      // Load existing messages without auto-opening
      setMessages(storedMessages);
    }
  }, [userId, isAuthenticated, starshipId, isVisionChamberFirstVisit]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || streaming) return;

    const userMessage: SibilMessage = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date().toISOString(),
      sessionId: sessionId.current
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setStreaming(true);

    try {
      const streamingMessage: SibilMessage = {
        id: (Date.now() + 1).toString(),
        content: '',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        sessionId: sessionId.current,
        provider: 'openai',
        model: 'gpt-4',
        streaming: true
      };

      setMessages(prev => [...prev, streamingMessage]);

      streamController.current = sibilAPI.sendMessageStream(
        {
          provider: 'openai',
          model: 'gpt-4',
          message: inputValue.trim(),
          sessionId: sessionId.current,
          starshipId
        },
        {
          onChunk: (chunk, accumulatedContent) => {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessage.id
                ? { ...msg, content: accumulatedContent }
                : msg
            ));
          },
          onComplete: (finalMessage) => {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessage.id
                ? { ...finalMessage, id: msg.id, streaming: false }
                : msg
            ));
            setStreaming(false);
            
            const allMessages = [...messages, userMessage, finalMessage];
            saveChatHistory(sessionId.current, allMessages);
          },
          onError: (error) => {
            console.error('Streaming error:', error);
            setStreaming(false);
            setMessages(prev => prev.filter(msg => msg.id !== streamingMessage.id));
          }
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleWidget = () => {
    if (isMinimized) {
      setIsMinimized(false);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleMinimize = () => {
    setIsMinimized(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={toggleWidget}
              className={cn(
                "rounded-full w-14 h-14 p-0 shadow-lg",
                "bg-gradient-to-br from-emerald-500 to-emerald-600",
                "hover:from-emerald-600 hover:to-emerald-700",
                "transition-all duration-200 hover:scale-105"
              )}
            >
              <Bot className="w-6 h-6 text-white" />
            </Button>
            {/* Notification indicator disabled while onboarding is being redesigned */}
            {/* isFirstStarship && isVisionChamberFirstVisit && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-2"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
                  <div className="relative bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    !
                  </div>
                </div>
              </motion.div>
            ) */}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Widget */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ 
              opacity: isMinimized ? 0.7 : 1, 
              scale: 1, 
              y: 0,
              height: isMinimized ? '60px' : '500px'
            }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed bottom-6 right-6 z-50",
              "w-96 bg-background/95 backdrop-blur-xl",
              "rounded-2xl shadow-2xl border border-border/50",
              "flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-gradient-to-r from-emerald-500/10 to-emerald-600/10">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bot className="w-5 h-5 text-emerald-500" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Sibil AI</h3>
                  <p className="text-xs text-muted-foreground">Always here to help</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleMinimize}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/10"
                >
                  <Minimize2 className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleClose}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            {!isMinimized && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-xl px-4 py-2",
                          message.role === 'user'
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mb-1">
                            <Bot className="w-3 h-3 text-emerald-500" />
                            <span className="text-xs text-muted-foreground">Sibil</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {message.streaming && (
                          <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-border/50">
                  <div className="flex gap-2">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask Sibil anything..."
                      className="flex-1 bg-background/50"
                      disabled={streaming}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputValue.trim() || streaming}
                      size="icon"
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      {streaming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}