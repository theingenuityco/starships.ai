'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Search, 
  X, 
  Filter, 
  Calendar,
  User,
  Bot,
  Crown,
  Settings,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

interface ExpeditionMessage {
  id: string;
  expeditionId: string;
  role: 'user' | 'first-officer' | 'agent' | 'system';
  agentId?: string;
  userId?: string;
  content: string;
  messageType: 'coordination' | 'task-work' | 'user-input' | 'status-update' | 'result' | 'question' | 'notification';
  timestamp: string;
  threadId?: string;
  parentMessageId?: string;
  metadata?: Record<string, any>;
}

interface SearchFilters {
  query: string;
  role?: 'user' | 'first-officer' | 'agent' | 'system' | 'all';
  messageType?: 'coordination' | 'task-work' | 'user-input' | 'status-update' | 'result' | 'question' | 'notification' | 'all';
  agentId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  hasAttachments?: boolean;
  threadId?: string;
}

interface MessageSearchProps {
  messages: ExpeditionMessage[];
  onSearchResults: (results: ExpeditionMessage[], query: string) => void;
  onHighlightMessage: (messageId: string) => void;
  availableAgents?: Array<{ id: string; name: string }>;
  className?: string;
}

export function MessageSearch({
  messages,
  onSearchResults,
  onHighlightMessage,
  availableAgents = [],
  className
}: MessageSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    role: 'all',
    messageType: 'all'
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [searchResults, setSearchResults] = useState<ExpeditionMessage[]>([]);

  // Debounced search function
  const performSearch = useCallback((searchFilters: SearchFilters) => {
    let results = [...messages];

    // Text search
    if (searchFilters.query.trim()) {
      const query = searchFilters.query.toLowerCase().trim();
      results = results.filter(message =>
        message.content.toLowerCase().includes(query) ||
        (message.agentId && message.agentId.toLowerCase().includes(query))
      );
    }

    // Role filter
    if (searchFilters.role && searchFilters.role !== 'all') {
      results = results.filter(message => message.role === searchFilters.role);
    }

    // Message type filter
    if (searchFilters.messageType && searchFilters.messageType !== 'all') {
      results = results.filter(message => message.messageType === searchFilters.messageType);
    }

    // Agent filter
    if (searchFilters.agentId) {
      results = results.filter(message => message.agentId === searchFilters.agentId);
    }

    // Date range filter
    if (searchFilters.dateRange) {
      const { start, end } = searchFilters.dateRange;
      results = results.filter(message => {
        const messageDate = new Date(message.timestamp);
        return isAfter(messageDate, startOfDay(start)) && isBefore(messageDate, endOfDay(end));
      });
    }

    // Attachments filter
    if (searchFilters.hasAttachments !== undefined) {
      results = results.filter(message => {
        const hasAttachments = message.metadata?.attachments && message.metadata.attachments.length > 0;
        return searchFilters.hasAttachments ? hasAttachments : !hasAttachments;
      });
    }

    // Thread filter
    if (searchFilters.threadId) {
      results = results.filter(message => message.threadId === searchFilters.threadId);
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setSearchResults(results);
    setCurrentResultIndex(results.length > 0 ? 0 : -1);
    onSearchResults(results, searchFilters.query);
  }, [messages, onSearchResults]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(filters);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [filters, performSearch]);

  // Navigation functions
  const navigateToResult = (index: number) => {
    if (searchResults.length === 0) return;
    
    const clampedIndex = Math.max(0, Math.min(index, searchResults.length - 1));
    setCurrentResultIndex(clampedIndex);
    
    if (searchResults[clampedIndex]) {
      onHighlightMessage(searchResults[clampedIndex].id);
    }
  };

  const nextResult = () => {
    navigateToResult(currentResultIndex + 1);
  };

  const previousResult = () => {
    navigateToResult(currentResultIndex - 1);
  };

  // Clear search
  const clearSearch = () => {
    setFilters({
      query: '',
      role: 'all',
      messageType: 'all'
    });
    setCurrentResultIndex(-1);
    setSearchResults([]);
    onSearchResults(messages, '');
  };

  // Get role icon
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'user': return User;
      case 'first-officer': return Crown;
      case 'agent': return Bot;
      case 'system': return Settings;
      default: return User;
    }
  };

  // Get unique threads
  const availableThreads = useMemo(() => {
    const threads = new Set<string>();
    messages.forEach(message => {
      if (message.threadId) {
        threads.add(message.threadId);
      }
    });
    return Array.from(threads);
  }, [messages]);

  return (
    <TooltipProvider>
      <div className={cn("space-y-3 p-3 border-b bg-muted/20", className)}>
        {/* Main search bar */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              value={filters.query}
              onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
              className="pl-10 pr-10"
            />
            {filters.query && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setFilters(prev => ({ ...prev, query: '' }))}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Results navigation */}
          {searchResults.length > 0 && (
            <div className="flex items-center space-x-1">
              <span className="text-sm text-muted-foreground">
                {currentResultIndex + 1} of {searchResults.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={previousResult}
                disabled={currentResultIndex <= 0}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={nextResult}
                disabled={currentResultIndex >= searchResults.length - 1}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Advanced filters toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Advanced filters</p>
            </TooltipContent>
          </Tooltip>

          {/* Clear search */}
          {(filters.query || filters.role !== 'all' || filters.messageType !== 'all') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={clearSearch}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear search</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="space-y-3 p-3 bg-background rounded-md border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Advanced Filters</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowAdvanced(false)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Role filter */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Role</label>
                <Select
                  value={filters.role || 'all'}
                  onValueChange={(value) => setFilters(prev => ({ 
                    ...prev, 
                    role: value === 'all' ? undefined : value as any 
                  }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="user">
                      <div className="flex items-center space-x-2">
                        <User className="h-3 w-3" />
                        <span>User</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="first-officer">
                      <div className="flex items-center space-x-2">
                        <Crown className="h-3 w-3" />
                        <span>First Officer</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="agent">
                      <div className="flex items-center space-x-2">
                        <Bot className="h-3 w-3" />
                        <span>Agent</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center space-x-2">
                        <Settings className="h-3 w-3" />
                        <span>System</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Message type filter */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Message Type</label>
                <Select
                  value={filters.messageType || 'all'}
                  onValueChange={(value) => setFilters(prev => ({ 
                    ...prev, 
                    messageType: value === 'all' ? undefined : value as any 
                  }))}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="coordination">Coordination</SelectItem>
                    <SelectItem value="task-work">Task Work</SelectItem>
                    <SelectItem value="user-input">User Input</SelectItem>
                    <SelectItem value="question">Question</SelectItem>
                    <SelectItem value="result">Result</SelectItem>
                    <SelectItem value="status-update">Status Update</SelectItem>
                    <SelectItem value="notification">Notification</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Agent filter */}
              {availableAgents.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Agent</label>
                  <Select
                    value={filters.agentId || 'all'}
                    onValueChange={(value) => setFilters(prev => ({ 
                      ...prev, 
                      agentId: value === 'all' ? undefined : value 
                    }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All agents</SelectItem>
                      {availableAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Thread filter */}
              {availableThreads.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Thread</label>
                  <Select
                    value={filters.threadId || 'all'}
                    onValueChange={(value) => setFilters(prev => ({ 
                      ...prev, 
                      threadId: value === 'all' ? undefined : value 
                    }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All threads</SelectItem>
                      {availableThreads.map((threadId) => (
                        <SelectItem key={threadId} value={threadId}>
                          Thread {threadId.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active filters display */}
        {(filters.role !== 'all' || filters.messageType !== 'all' || filters.agentId || filters.threadId) && (
          <div className="flex items-center space-x-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            
            {filters.role && filters.role !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                Role: {filters.role}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3 w-3 p-0 ml-1"
                  onClick={() => setFilters(prev => ({ ...prev, role: 'all' }))}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            )}

            {filters.messageType && filters.messageType !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                Type: {filters.messageType}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3 w-3 p-0 ml-1"
                  onClick={() => setFilters(prev => ({ ...prev, messageType: 'all' }))}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            )}

            {filters.agentId && (
              <Badge variant="secondary" className="text-xs">
                Agent: {availableAgents.find(a => a.id === filters.agentId)?.name || filters.agentId}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3 w-3 p-0 ml-1"
                  onClick={() => setFilters(prev => ({ ...prev, agentId: undefined }))}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            )}

            {filters.threadId && (
              <Badge variant="secondary" className="text-xs">
                Thread: {filters.threadId.slice(0, 8)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-3 w-3 p-0 ml-1"
                  onClick={() => setFilters(prev => ({ ...prev, threadId: undefined }))}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            )}
          </div>
        )}

        {/* Search results summary */}
        {filters.query && (
          <div className="text-xs text-muted-foreground">
            {searchResults.length === 0 ? (
              'No messages found'
            ) : (
              `Found ${searchResults.length} message${searchResults.length === 1 ? '' : 's'}`
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}