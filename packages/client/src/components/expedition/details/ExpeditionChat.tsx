'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'agent';
  senderName?: string;
}

export function ExpeditionChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Welcome to Expedition Alpha Mission. All systems are operational and ready for deployment.',
      timestamp: new Date(Date.now() - 3600000),
      sender: 'agent',
      senderName: 'Mission Control'
    },
    {
      id: '2',
      content: 'Acknowledged. Beginning preliminary scans of the sector.',
      timestamp: new Date(Date.now() - 3000000),
      sender: 'user',
      senderName: 'Commander'
    },
    {
      id: '3',
      content: 'Scan complete. Detecting unusual energy signatures in quadrant 7-G. Recommend further investigation.',
      timestamp: new Date(Date.now() - 2400000),
      sender: 'agent',
      senderName: 'Science Officer AI'
    }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      timestamp: new Date(),
      sender: 'user',
      senderName: 'Commander'
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');

    // Simulate agent response
    setIsTyping(true);
    setTimeout(() => {
      const agentResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Message received. Analyzing data and preparing response...',
        timestamp: new Date(),
        sender: 'agent',
        senderName: 'Mission Control'
      };
      setMessages(prev => [...prev, agentResponse]);
      setIsTyping(false);
    }, 2000);
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
        {messages.length === 0 ? (
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
                    <span className="text-xs font-medium opacity-80">
                      {message.senderName}
                    </span>
                    <span className="text-xs opacity-60">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm">{message.content}</p>
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
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:bg-slate-800/70 transition-all resize-none"
          rows={1}
          style={{ minHeight: '48px', maxHeight: '120px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className={`px-6 py-3 font-medium rounded-xl transition-all transform shadow-lg ${
            inputValue.trim()
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white hover:scale-105 active:scale-95 shadow-blue-600/20'
              : 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}