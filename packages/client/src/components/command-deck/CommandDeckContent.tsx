'use client';

import { motion } from 'motion/react';
import { Command, Settings, Monitor, Zap } from 'lucide-react';

export function CommandDeckContent() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="flex items-center justify-center mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="p-4 rounded-full bg-primary/10 border border-primary/20"
          >
            <Command className="w-12 h-12 text-primary" />
          </motion.div>
        </div>
        
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Command Deck
        </h1>
        
        <p className="text-muted-foreground max-w-lg text-lg leading-relaxed">
          Your mission control center is being prepared. This will be the central hub for 
          managing all starship operations, monitoring systems, and coordinating expeditions.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl w-full"
      >
        <div className="p-4 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-center">
          <Monitor className="w-6 h-6 text-primary mx-auto mb-2" />
          <h3 className="font-semibold text-sm">System Monitoring</h3>
          <p className="text-xs text-muted-foreground mt-1">Real-time status tracking</p>
        </div>
        
        <div className="p-4 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-center">
          <Settings className="w-6 h-6 text-primary mx-auto mb-2" />
          <h3 className="font-semibold text-sm">Operations Control</h3>
          <p className="text-xs text-muted-foreground mt-1">Mission coordination</p>
        </div>
        
        <div className="p-4 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-center">
          <Zap className="w-6 h-6 text-primary mx-auto mb-2" />
          <h3 className="font-semibold text-sm">Power Management</h3>
          <p className="text-xs text-muted-foreground mt-1">Resource optimization</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="text-center"
      >
        <p className="text-sm text-muted-foreground">
          Meanwhile, explore the <span className="text-primary font-semibold">Vision Chamber</span> to define your mission objectives.
        </p>
      </motion.div>
    </div>
  );
}