'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

// Import fractal sub-components
import { StatementEditor } from './StatementEditor';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { RefinementHistory } from './RefinementHistory';

interface VisionCoreProps {
  className?: string;
}

export function VisionCore({ className }: VisionCoreProps) {
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

  // Confidence logic moved to ConfidenceIndicator component

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
          <ConfidenceIndicator confidence={vision.confidence} />
          
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEditing}
              className="border-white/10 text-white/80 hover:bg-white/5"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
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
          <StatementEditor
            value={editingVision}
            onChange={setEditingVision}
            onSave={handleSaveVision}
            onCancel={handleCancelEditing}
            isSaving={isSaving}
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

        {vision.statement && !isEditing && (
          <RefinementHistory lastUpdated={vision.lastUpdated} />
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white">Updating vision...</span>
          </div>
        </div>
      )}
    </Card>
  );
} 