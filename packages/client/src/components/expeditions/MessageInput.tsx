'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, Smile, AtSign } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (content: string, messageType?: MessageType, agentId?: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  showMessageType?: boolean;
  showAgentSelector?: boolean;
  availableAgents?: Array<{ id: string; name: string }>;
}

type MessageType = 'coordination' | 'task-work' | 'user-input' | 'status-update' | 'result' | 'question' | 'notification';

export function MessageInput({
  onSendMessage,
  disabled = false,
  placeholder = 'Type your message...',
  showMessageType = true,
  showAgentSelector = false,
  availableAgents = []
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('user-input');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(
        message.trim(), 
        messageType, 
        selectedAgent || undefined
      );
      setMessage('');
      setSelectedAgent('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getMessageTypeConfig = (type: MessageType) => {
    switch (type) {
      case 'coordination':
        return { label: 'Coordination', color: 'text-purple-600', description: 'Coordinate with First Officer' };
      case 'task-work':
        return { label: 'Task Work', color: 'text-green-600', description: 'Work on specific tasks' };
      case 'user-input':
        return { label: 'General', color: 'text-blue-600', description: 'General conversation' };
      case 'question':
        return { label: 'Question', color: 'text-yellow-600', description: 'Ask a question' };
      case 'status-update':
        return { label: 'Status', color: 'text-gray-600', description: 'Status update' };
      case 'result':
        return { label: 'Result', color: 'text-green-600', description: 'Share results' };
      case 'notification':
        return { label: 'Notification', color: 'text-gray-600', description: 'Send notification' };
      default:
        return { label: type, color: 'text-gray-600', description: '' };
    }
  };

  const currentTypeConfig = getMessageTypeConfig(messageType);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Message Type and Agent Selector */}
      {(showMessageType || showAgentSelector) && (
        <div className="flex items-center space-x-3">
          {showMessageType && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Type:</span>
              <Select 
                value={messageType} 
                onValueChange={(value) => setMessageType(value as MessageType)}
                disabled={disabled || sending}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user-input">
                    <div className="flex flex-col">
                      <span>General</span>
                      <span className="text-xs text-muted-foreground">General conversation</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="coordination">
                    <div className="flex flex-col">
                      <span>Coordination</span>
                      <span className="text-xs text-muted-foreground">Coordinate with First Officer</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="question">
                    <div className="flex flex-col">
                      <span>Question</span>
                      <span className="text-xs text-muted-foreground">Ask a question</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="task-work">
                    <div className="flex flex-col">
                      <span>Task Work</span>
                      <span className="text-xs text-muted-foreground">Work on specific tasks</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className={currentTypeConfig.color}>
                {currentTypeConfig.label}
              </Badge>
            </div>
          )}

          {showAgentSelector && availableAgents.length > 0 && (
            <div className="flex items-center space-x-2">
              <AtSign className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={selectedAgent} 
                onValueChange={setSelectedAgent}
                disabled={disabled || sending}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Direct to agent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    <span className="text-muted-foreground">All participants</span>
                  </SelectItem>
                  {availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Message Input */}
      <div className="flex items-end space-x-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={disabled ? placeholder : `${placeholder} (Shift+Enter for new line)`}
            disabled={disabled || sending}
            className="min-h-[44px] max-h-32 resize-none pr-20"
            rows={1}
          />
          
          {/* Action buttons inside textarea */}
          <div className="absolute right-2 bottom-2 flex items-center space-x-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={disabled || sending}
              onClick={() => {
                // TODO: Implement emoji picker
                console.log('Emoji picker not implemented yet');
              }}
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              disabled={disabled || sending}
              onClick={() => {
                // TODO: Implement file attachment
                console.log('File attachment not implemented yet');
              }}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Send Button */}
        <Button
          type="submit"
          disabled={!message.trim() || disabled || sending}
          size="sm"
          className="h-11"
        >
          {sending ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Character count and hints */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center space-x-4">
          {selectedAgent && (
            <span>Directing to: {availableAgents.find(a => a.id === selectedAgent)?.name}</span>
          )}
          {currentTypeConfig.description && (
            <span>{currentTypeConfig.description}</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span>{message.length}/2000</span>
          {message.length > 1800 && (
            <span className="text-yellow-600">Character limit approaching</span>
          )}
        </div>
      </div>
    </form>
  );
}