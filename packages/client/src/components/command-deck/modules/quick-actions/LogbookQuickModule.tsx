import { BookOpen, Search, FileText, Plus } from 'lucide-react';

interface LogbookQuickModuleProps {
  data: any;
  onAction: (action: string, data?: any) => void;
}

export function LogbookQuickModule({ data: _data, onAction }: LogbookQuickModuleProps) {
  const totalEntries = 247;
  const unreadEntries = 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total Entries</span>
        <span className="text-sm font-mono">{totalEntries}</span>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Unread</span>
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 text-blue-500" />
          <span className="text-xs text-blue-600 dark:text-blue-400">{unreadEntries} new</span>
        </div>
      </div>
      
      <div className="pt-2 border-t border-border/50 space-y-1">
        <button
          onClick={() => onAction('search-logs')}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs transition-colors"
        >
          <Search className="w-3 h-3" />
          Search Logs
        </button>
      </div>
    </div>
  );
} 