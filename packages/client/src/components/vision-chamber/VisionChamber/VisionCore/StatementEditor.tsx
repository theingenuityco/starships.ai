'use client';

import { useState } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StatementEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  placeholder?: string;
}

export function StatementEditor({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  placeholder = "What is your starship's core mission and purpose? What drives every decision and action?"
}: StatementEditorProps) {
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-32 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-none"
        disabled={isSaving}
        autoFocus
      />
      
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/40">
          {value.length} characters
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="border-white/10 text-white/60 hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving || !value.trim()}
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
} 