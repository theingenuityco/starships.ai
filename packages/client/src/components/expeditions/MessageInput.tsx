'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
}

interface MessageInputProps {
  onSendMessage: (content: string, participantId?: string) => Promise<void>;
  agents: Agent[];
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSendMessage,
  agents,
  maxLength = 5000,
  disabled = false,
  placeholder = 'Type your message here...',
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string>('first-officer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    // Validation
    if (!content.trim()) {
      setError('Message cannot be empty');
      return;
    }

    if (content.length > maxLength) {
      setError(`Message exceeds maximum length of ${maxLength} characters`);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      // Add a brief visual feedback before sending
      if (containerRef.current) {
        containerRef.current.style.transform = 'scale(0.98)';
        containerRef.current.style.transition = 'transform 0.1s ease-out';
      }

      // Determine participantId based on selection
      const participantId = selectedParticipant === 'first-officer' 
        ? undefined 
        : selectedParticipant;

      await onSendMessage(content.trim(), participantId);
      
      // Clear form on success
      setContent('');
      setSelectedParticipant('first-officer');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const remainingChars = maxLength - content.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div 
      ref={containerRef}
      className={cn(
        'h-full flex flex-col transition-all duration-200 ease-out',
        isSubmitting && 'opacity-95'
      )}
    >
      <form onSubmit={handleSubmit} className="h-full flex flex-col space-y-4">
        {/* Participant Selector */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <label htmlFor="participant-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Send to:
          </label>
          <Select
            value={selectedParticipant}
            onValueChange={setSelectedParticipant}
            disabled={disabled || isSubmitting}
          >
            <SelectTrigger id="participant-select" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first-officer">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <span>First Officer</span>
                </div>
              </SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-green-500" />
                    <span>{agent.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Message Input Area */}
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSubmitting}
            className={cn(
              'h-full resize-none pr-12',
              'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'transition-all duration-200 ease-out',
              error && 'border-red-500 focus:ring-red-500',
              isOverLimit && 'border-orange-500 focus:ring-orange-500'
            )}
            aria-label="Message content"
            aria-invalid={!!error}
            aria-describedby={error ? 'message-error' : undefined}
            data-testid="message-input"
          />
          
          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            disabled={disabled || isSubmitting || !content.trim() || isOverLimit}
            className={cn(
              'absolute bottom-2 right-2',
              'transition-all duration-200 hover:scale-105 active:scale-95',
              isSubmitting && 'opacity-50 cursor-not-allowed scale-95',
              content.trim() && !isOverLimit && 'bg-blue-600 hover:bg-blue-700'
            )}
            aria-label="Send message"
          >
            <Send className={cn(
              'h-4 w-4 transition-transform duration-200',
              isSubmitting && 'animate-pulse scale-90'
            )} />
          </Button>
        </div>

        {/* Footer: Character count and error messages */}
        <div className="flex items-center justify-between text-sm flex-shrink-0">
          {/* Error Message */}
          <div className="flex-1">
            {error && (
              <div id="message-error" className="flex items-center gap-1 text-red-500">
                <AlertCircle className="h-3 w-3" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Character Count */}
          <div
            className={cn(
              'text-gray-500 dark:text-gray-400',
              remainingChars < 100 && 'text-orange-500 dark:text-orange-400',
              isOverLimit && 'text-red-500 dark:text-red-400 font-medium'
            )}
          >
            {remainingChars < 100 ? (
              <span>
                {isOverLimit ? 'Over limit: ' : ''}
                {Math.abs(remainingChars)} {Math.abs(remainingChars) === 1 ? 'character' : 'characters'}
                {isOverLimit ? ' too many' : ' remaining'}
              </span>
            ) : (
              <span>{content.length} / {maxLength}</span>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">Enter</kbd> to send or{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">Shift+Enter</kbd> for new line
        </div>
      </form>
    </div>
  );
}