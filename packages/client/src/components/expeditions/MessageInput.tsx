'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  Send,
  Paperclip,
  Smile,
  AtSign,
  X,
  Image,
  FileText,
  Mic,
  MicOff,
  Bold,
  Italic,
  Code,
  Link,
  List,
  Hash,
  Quote,
  Zap,
  Upload,
  AlertCircle,
  Reply
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Enhanced type definitions
interface FileAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
  uploadProgress?: number;
  error?: string;
}

interface MessageDraft {
  content: string;
  messageType: MessageType;
  agentId?: string;
  attachments: FileAttachment[];
  threadId?: string;
  parentMessageId?: string;
}

interface MessageInputProps {
  onSendMessage: (content: string, messageType?: MessageType, agentId?: string, attachments?: FileAttachment[], threadId?: string, parentMessageId?: string) => Promise<void>;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  onDraftSave?: (draft: MessageDraft) => void;
  onDraftLoad?: () => MessageDraft | null;
  disabled?: boolean;
  placeholder?: string;
  showMessageType?: boolean;
  showAgentSelector?: boolean;
  showFormatting?: boolean;
  showAttachments?: boolean;
  showVoiceInput?: boolean;
  maxAttachments?: number;
  maxAttachmentSize?: number; // in bytes
  allowedFileTypes?: string[];
  availableAgents?: Array<{ id: string; name: string; status?: 'online' | 'busy' | 'offline' }>;
  replyingTo?: {
    id: string;
    content: string;
    author: string;
  };
  threadId?: string;
  className?: string;
}

type MessageType = 'coordination' | 'task-work' | 'user-input' | 'status-update' | 'result' | 'question' | 'notification';

// Formatting options
interface FormattingOption {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: (textarea: HTMLTextAreaElement) => void;
  shortcut?: string;
}

export function MessageInput({
  onSendMessage,
  onTypingStart,
  onTypingStop,
  onDraftSave,
  onDraftLoad,
  disabled = false,
  placeholder = 'Type your message...',
  showMessageType = true,
  showAgentSelector = false,
  showFormatting = true,
  showAttachments = true,
  showVoiceInput = false,
  maxAttachments = 5,
  maxAttachmentSize = 10 * 1024 * 1024, // 10MB
  allowedFileTypes = ['image/*', 'text/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  availableAgents = [],
  replyingTo,
  threadId,
  className
}: MessageInputProps) {
  // State management
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('user-input');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const draftTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Formatting options
  const formattingOptions: FormattingOption[] = [
    {
      key: 'bold',
      label: 'Bold',
      icon: Bold,
      action: (textarea) => insertFormatting(textarea, '**', '**'),
      shortcut: 'Ctrl+B'
    },
    {
      key: 'italic',
      label: 'Italic',
      icon: Italic,
      action: (textarea) => insertFormatting(textarea, '*', '*'),
      shortcut: 'Ctrl+I'
    },
    {
      key: 'code',
      label: 'Code',
      icon: Code,
      action: (textarea) => insertFormatting(textarea, '`', '`'),
      shortcut: 'Ctrl+`'
    },
    {
      key: 'link',
      label: 'Link',
      icon: Link,
      action: (textarea) => insertFormatting(textarea, '[', '](url)'),
      shortcut: 'Ctrl+K'
    },
    {
      key: 'list',
      label: 'List',
      icon: List,
      action: (textarea) => insertFormatting(textarea, '- ', ''),
      shortcut: 'Ctrl+L'
    },
    {
      key: 'quote',
      label: 'Quote',
      icon: Quote,
      action: (textarea) => insertFormatting(textarea, '> ', ''),
      shortcut: 'Ctrl+>'
    }
  ];

  // Utility functions
  const insertFormatting = (textarea: HTMLTextAreaElement, before: string, after: string) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = before + selectedText + after;
    
    const newValue = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    setMessage(newValue);
    
    // Set cursor position
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: FileAttachment[] = [];

    fileArray.forEach((file) => {
      // Check file count
      if (attachments.length + validFiles.length >= maxAttachments) {
        return;
      }

      // Check file size
      if (file.size > maxAttachmentSize) {
        console.warn(`File ${file.name} is too large (${file.size} bytes)`);
        return;
      }

      // Check file type
      const isAllowed = allowedFileTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      });

      if (!isAllowed) {
        console.warn(`File type ${file.type} is not allowed`);
        return;
      }

      const attachment: FileAttachment = {
        id: `${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadProgress: 0
      };

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          attachment.preview = e.target?.result as string;
          setAttachments(prev => prev.map(a => a.id === attachment.id ? attachment : a));
        };
        reader.readAsDataURL(file);
      }

      validFiles.push(attachment);
    });

    setAttachments(prev => [...prev, ...validFiles]);
  }, [attachments.length, maxAttachments, maxAttachmentSize, allowedFileTypes]);

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      onTypingStart?.();
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      onTypingStop?.();
    }, 2000);
  }, [isTyping, onTypingStart, onTypingStop]);

  const saveDraft = useCallback(() => {
    if (onDraftSave && (message.trim() || attachments.length > 0)) {
      const draft: MessageDraft = {
        content: message,
        messageType,
        agentId: selectedAgent || undefined,
        attachments,
        threadId,
        parentMessageId: replyingTo?.id
      };
      onDraftSave(draft);
    }
  }, [message, messageType, selectedAgent, attachments, threadId, replyingTo, onDraftSave]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Handle typing indicators
  useEffect(() => {
    if (message.trim()) {
      handleTyping();
    }
  }, [message, handleTyping]);

  // Auto-save draft
  useEffect(() => {
    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current);
    }
    
    draftTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 1000);

    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, [saveDraft]);

  // Load draft on mount
  useEffect(() => {
    if (onDraftLoad) {
      const draft = onDraftLoad();
      if (draft) {
        setMessage(draft.content);
        setMessageType(draft.messageType);
        setSelectedAgent(draft.agentId || '');
        setAttachments(draft.attachments);
      }
    }
  }, [onDraftLoad]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, []);

  // Event handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && attachments.length === 0) || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(
        message.trim(),
        messageType,
        selectedAgent || undefined,
        attachments.length > 0 ? attachments : undefined,
        threadId,
        replyingTo?.id
      );
      
      // Reset form
      setMessage('');
      setSelectedAgent('');
      setAttachments([]);
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      // Stop typing indicator
      if (isTyping) {
        setIsTyping(false);
        onTypingStop?.();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      const option = formattingOptions.find(opt =>
        opt.shortcut?.toLowerCase().includes(e.key.toLowerCase())
      );
      if (option && textareaRef.current) {
        e.preventDefault();
        option.action(textareaRef.current);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files);
    }
    // Reset input
    e.target.value = '';
  };

  const handleEmojiSelect = (emoji: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newMessage = message.substring(0, start) + emoji + message.substring(end);
      setMessage(newMessage);
      
      // Set cursor position after emoji
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = start + emoji.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
    setShowEmojiPicker(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
    <TooltipProvider>
      <div className={cn("space-y-3", className)}>
        {/* Reply indicator */}
        {replyingTo && (
          <div className="flex items-center justify-between p-2 bg-muted rounded-md">
            <div className="flex items-center space-x-2">
              <Reply className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Replying to <strong>{replyingTo.author}</strong>
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-xs">
                {replyingTo.content}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => {/* TODO: Clear reply */}}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Attachments ({attachments.length})</div>
            <div className="grid grid-cols-2 gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center space-x-2 p-2 bg-muted rounded-md">
                  {attachment.type.startsWith('image/') ? (
                    <Image className="h-4 w-4 text-blue-500" />
                  ) : (
                    <FileText className="h-4 w-4 text-gray-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                  </div>
                  {attachment.uploadProgress !== undefined && attachment.uploadProgress < 100 && (
                    <Progress value={attachment.uploadProgress} className="w-12 h-2" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                          <div className="flex items-center space-x-2">
                            <span>{agent.name}</span>
                            {agent.status && (
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                agent.status === 'online' ? 'bg-green-500' :
                                agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-400'
                              )} />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Formatting toolbar */}
          {showFormatting && (
            <div className="flex items-center space-x-1 p-2 bg-muted/50 rounded-md">
              {formattingOptions.map((option) => (
                <Tooltip key={option.key}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={disabled || sending}
                      onClick={() => textareaRef.current && option.action(textareaRef.current)}
                    >
                      <option.icon className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{option.label} {option.shortcut && `(${option.shortcut})`}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Message Input */}
          <div
            className={cn(
              "flex items-end space-x-2 transition-colors",
              dragOver && "bg-blue-50 dark:bg-blue-950/20 border-2 border-dashed border-blue-300 rounded-md p-2"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={disabled ? placeholder : `${placeholder} (Shift+Enter for new line)`}
                disabled={disabled || sending}
                className={cn(
                  "min-h-[44px] max-h-32 resize-none pr-24",
                  dragOver && "border-blue-300"
                )}
                rows={1}
              />
              
              {/* Action buttons inside textarea */}
              <div className="absolute right-2 bottom-2 flex items-center space-x-1">
                {showAttachments && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={disabled || sending || attachments.length >= maxAttachments}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Attach files ({attachments.length}/{maxAttachments})</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={disabled || sending}
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add emoji</p>
                  </TooltipContent>
                </Tooltip>

                {showVoiceInput && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-6 w-6 p-0",
                          isRecording && "text-red-500"
                        )}
                        disabled={disabled || sending}
                        onClick={() => setIsRecording(!isRecording)}
                      >
                        {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isRecording ? 'Stop recording' : 'Voice input'}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Drag overlay */}
              {dragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 dark:bg-blue-950/80 rounded-md">
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                    <p className="text-sm text-blue-600 dark:text-blue-400">Drop files here</p>
                  </div>
                </div>
              )}
            </div>

            {/* Send Button */}
            <Button
              type="submit"
              disabled={(!message.trim() && attachments.length === 0) || disabled || sending}
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
              {isTyping && (
                <span className="text-blue-500">Typing...</span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span>{message.length}/2000</span>
              {message.length > 1800 && (
                <span className="text-yellow-600 flex items-center space-x-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Character limit approaching</span>
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Hidden file input */}
        <Input
          ref={fileInputRef}
          type="file"
          multiple
          accept={allowedFileTypes.join(',')}
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Simple emoji picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-full mb-2 p-2 bg-background border rounded-md shadow-lg">
            <div className="grid grid-cols-8 gap-1">
              {['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🎉', '🚀', '💡', '✅', '❌', '⚡', '🔥', '💯', '🎯'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="p-1 hover:bg-muted rounded text-lg"
                  onClick={() => handleEmojiSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}