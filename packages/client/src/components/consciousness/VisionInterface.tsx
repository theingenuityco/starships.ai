'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, Edit3, Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface VisionInterfaceProps {
  className?: string;
}

export function VisionInterface({ className }: VisionInterfaceProps) {
  const {
    activeStarshipId,
    vision,
    updateVisionAPI,
    loading,
    error
  } = useStarshipStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editingVision, setEditingVision] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setEditingVision(vision.statement);
    }
  }, [isEditing, vision.statement]);

  const handleStartEditing = () => {
    setIsEditing(true);
    setEditingVision(vision.statement);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditingVision('');
  };

  const handleSaveVision = useCallback(async () => {
    if (!activeStarshipId || !editingVision.trim()) return;

    setIsSaving(true);
    try {
      await updateVisionAPI(editingVision.trim());
      setIsEditing(false);
      setEditingVision('');
    } catch (error) {
      console.error('Failed to save vision:', error);
    } finally {
      setIsSaving(false);
    }
  }, [activeStarshipId, editingVision, updateVisionAPI]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400 bg-green-500/20';
    if (confidence >= 60) return 'text-yellow-400 bg-yellow-500/20';
    if (confidence >= 40) return 'text-orange-400 bg-orange-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return 'Clear';
    if (confidence >= 60) return 'Moderate';
    if (confidence >= 40) return 'Developing';
    return 'Unclear';
  };

  if (!activeStarshipId) {
    return (
      <Card className={cn("p-6 bg-black/20 border-white/10", className)}>
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <Eye className="w-8 h-8 mx-auto mb-2 text-white/40" />
            <p className="text-sm text-white/60">No active starship</p>
            <p className="text-xs text-white/40">Select a starship to view its vision</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-6 bg-black/20 border-white/10", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-white">Vision Statement</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {vision.confidence > 0 && (
            <Badge
              variant="outline"
              className={cn("text-xs", getConfidenceColor(vision.confidence))}
            >
              {getConfidenceLabel(vision.confidence)} ({vision.confidence}%)
            </Badge>
          )}
          
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEditing}
              className="border-white/10 text-white/80 hover:bg-white/5"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEditing}
                disabled={isSaving}
                className="border-white/10 text-white/60 hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveVision}
                disabled={isSaving || !editingVision.trim()}
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {isEditing ? (
          <textarea
            value={editingVision}
            onChange={(e) => setEditingVision(e.target.value)}
            placeholder="What is your starship's core mission and purpose? What drives every decision and action?"
            className="w-full h-32 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-none"
            disabled={isSaving}
          />
        ) : (
          <div className="min-h-[128px] p-3 bg-black/30 border border-white/10 rounded-lg">
            {vision.statement ? (
              <p className="text-white/80 leading-relaxed">{vision.statement}</p>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-white/40 mb-2">No vision statement yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartEditing}
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    Create Vision
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {vision.statement && (
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>
              Last updated: {vision.lastUpdated.toLocaleDateString()} at{' '}
              {vision.lastUpdated.toLocaleTimeString()}
            </span>
            <span>{vision.statement.length} characters</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span className="text-sm text-white">Updating vision...</span>
          </div>
        </div>
      )}
    </Card>
  );
} 