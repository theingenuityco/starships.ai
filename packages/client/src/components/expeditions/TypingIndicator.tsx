import { motion } from 'motion/react';

interface TypingIndicatorProps {
  agentName?: string;
  agentId?: string;
}

export function TypingIndicator({ agentName, agentId }: TypingIndicatorProps) {
  const displayName = agentName || (agentId === 'first-officer' ? 'First Officer' : 'Agent');
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground"
    >
      <span className="font-medium">{displayName}</span>
      <div className="flex gap-1">
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0 }}
          className="w-2 h-2 bg-muted-foreground rounded-full"
        />
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
          className="w-2 h-2 bg-muted-foreground rounded-full"
        />
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
          className="w-2 h-2 bg-muted-foreground rounded-full"
        />
      </div>
    </motion.div>
  );
}