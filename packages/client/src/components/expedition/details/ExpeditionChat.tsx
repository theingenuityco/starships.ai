'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import type { ChatMessage } from '@starships/protocol';

interface ExpeditionChatProps {
  expeditionId: string;
}

export function ExpeditionChat({ expeditionId }: ExpeditionChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatTerminated, setChatTerminated] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/api/expeditions/${expeditionId}/messages`);
        setMessages(response.data.messages);
      } catch (error) {
        console.error('Failed to load messages:', error);
        toast({
          title: 'Error',
          description: 'Failed to load chat history',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadMessages();
  }, [expeditionId, toast]);

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;

    const messageContent = inputValue;
    setInputValue('');
    
    // Add user message immediately (temporary)
    const tempUserMessage = {
      id: `temp-${Date.now()}`,
      content: messageContent,
      sender: 'user',
      senderName: 'Commander',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMessage]);
    setIsTyping(true);

    try {
      const response = await api.post(`/api/expeditions/${expeditionId}/messages`, {
        content: messageContent
      });
      
      // Replace temp message with real messages from server
      setMessages(prev => {
        // Remove the temporary message
        const filtered = prev.filter(msg => msg.id !== tempUserMessage.id);
        // Add the real messages
        return [...filtered, response.data.userMessage, response.data.agentMessage];
      });
      
      // Check if chat should be terminated (mission executing)
      if (response.data.agentMessage.metadata?.shouldTerminateChat) {
        setChatTerminated(true);
        toast({
          title: 'Mission Initiated!',
          description: 'The expedition is now executing.',
          variant: 'success'
        });
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to send message',
        variant: 'destructive'
      });
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      // Restore the input
      setInputValue(messageContent);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        Mission Communication
      </h2>
      
      <div className="flex-1 bg-slate-950/30 rounded-xl p-4 mb-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Start a conversation with your expedition team
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-xl px-4 py-3 ${
                    message.sender === 'user'
                      ? 'bg-blue-600/20 border border-blue-600/30 text-white'
                      : 'bg-green-600/20 border border-green-600/30 text-white'
                  }`}
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs opacity-60">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-sm prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Custom styles for markdown elements
                        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 ml-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 ml-2">{children}</ol>,
                        li: ({ children }) => <li className="mb-1 leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ inline, children }) => 
                          inline ? (
                            <code className="px-1 py-0.5 bg-slate-800 rounded text-xs">{children}</code>
                          ) : (
                            <code className="block p-3 bg-slate-800 rounded-lg text-xs overflow-x-auto">{children}</code>
                          ),
                        pre: ({ children }) => <pre className="mb-2">{children}</pre>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-slate-600 pl-4 italic mb-2">{children}</blockquote>
                        ),
                        a: ({ href, children }) => (
                          <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                        h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-2">{children}</h3>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-800/50 rounded-xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <div className="flex gap-3">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={chatTerminated}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:bg-slate-800/70 transition-all resize-none"
          rows={1}
          style={{ minHeight: '48px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isTyping || chatTerminated}
          className={`px-6 py-3 font-medium rounded-xl transition-all transform shadow-lg ${
            inputValue.trim() && !isTyping
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:scale-105 active:scale-95 shadow-blue-600/20'
              : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isTyping ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}