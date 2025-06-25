'use client';

import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, FileText, Lightbulb, Target } from 'lucide-react';

interface CodexEntry {
  id: string;
  title: string;
  category: 'mission' | 'knowledge' | 'insight' | 'procedure';
  content: string;
  relevance: number; // 0-100
  lastAccessed: Date;
}

interface CodexInterfaceProps {
  isVisible: boolean;
  currentRoute: string;
  missionEntries: CodexEntry[];
  knowledgeEntries: CodexEntry[];
  onEntrySelect: (entry: CodexEntry) => void;
  onClose?: () => void;
}

export function CodexInterface({ 
  isVisible, 
  currentRoute, 
  missionEntries, 
  knowledgeEntries, 
  onEntrySelect,
  onClose
}: CodexInterfaceProps) {
  const getCategoryIcon = (category: CodexEntry['category']) => {
    switch (category) {
      case 'mission': return Target;
      case 'knowledge': return BookOpen;
      case 'insight': return Lightbulb;
      case 'procedure': return FileText;
      default: return FileText;
    }
  };

  const getCategoryColor = (category: CodexEntry['category']) => {
    switch (category) {
      case 'mission': return 'text-orange-500';
      case 'knowledge': return 'text-blue-500';
      case 'insight': return 'text-yellow-500';
      case 'procedure': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  // Combine and sort entries by relevance
  const allEntries = [...missionEntries, ...knowledgeEntries]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 6); // Show top 6 most relevant

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 30,
            mass: 0.8,
            delay: 0.2 
          }}
          className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-96 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg z-50"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-amber-500/10 rounded-md">
                  <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-medium text-sm">Codex Interface</h3>
              </div>
              
              <div className="text-xs text-muted-foreground">
                {allEntries.length} relevant entries
              </div>
            </div>

            {/* Current Context */}
            <div className="mb-4 p-3 bg-background/50 border border-border/50 rounded">
              <div className="text-xs text-muted-foreground mb-1">Current Context</div>
              <div className="text-sm font-medium">
                {currentRoute === '/' ? 'Command Overview' : 
                 currentRoute === '/crew' ? 'Crew Operations' :
                 currentRoute === '/core' ? 'Aether Core Systems' :
                 currentRoute === '/expeditions' ? 'Mission Planning' :
                 currentRoute === '/drive' ? 'Propulsion Systems' :
                 currentRoute === '/logbook' ? 'Historical Records' :
                 currentRoute === '/sibil' ? 'Predictive Analysis' :
                 'Unknown Section'}
              </div>
            </div>

            {/* Relevant Entries */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Most Relevant Knowledge
              </div>
              
              {allEntries.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {allEntries.map((entry, index) => {
                    const IconComponent = getCategoryIcon(entry.category);
                    return (
                      <motion.button
                        key={entry.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => onEntrySelect(entry)}
                        className="w-full text-left p-2 bg-background/30 hover:bg-background/50 rounded text-xs transition-colors group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2 min-w-0 flex-1">
                            <IconComponent 
                              className={`w-3 h-3 mt-0.5 flex-shrink-0 ${getCategoryColor(entry.category)}`} 
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate group-hover:text-primary">
                                {entry.title}
                              </div>
                              <div className="text-muted-foreground line-clamp-2 mt-1">
                                {entry.content}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                            <div className="text-muted-foreground">
                              {entry.relevance}%
                            </div>
                            <div className="w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground p-3 bg-muted/30 border border-dashed border-border rounded text-center">
                  No relevant codex entries found for current context
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Quick Access</span>
                <div className="flex space-x-2">
                  <button className="px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors">
                    Search
                  </button>
                  <button className="px-2 py-1 bg-muted/30 text-muted-foreground rounded hover:bg-muted/50 transition-colors">
                    Recent
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 