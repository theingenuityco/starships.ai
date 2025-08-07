'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Edit,
  Check,
  X,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { VisionAnalysis } from '@/lib/onboarding/types';
import { validateVision } from '@/lib/onboarding/validation';
import { cn } from '@/lib/utils';

interface VisionReviewStepProps {
  initialVision: string;
  analysis?: VisionAnalysis | null;
  onConfirm: (vision: string) => void;
  onEdit?: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
}

export function VisionReviewStep({
  initialVision,
  analysis,
  onConfirm,
  onEdit,
  onSkip,
  allowSkip = false
}: VisionReviewStepProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedVision, setEditedVision] = useState(initialVision);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleSave = () => {
    const validation = validateVision(editedVision);
    if (!validation.valid) {
      setError(validation.error || 'Invalid vision');
      return;
    }
    
    setIsEditing(false);
    setError(null);
  };

  const handleCancel = () => {
    setEditedVision(initialVision);
    setIsEditing(false);
    setError(null);
  };

  const handleConfirm = () => {
    onConfirm(isEditing ? editedVision : initialVision);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium">
          Your Vision Statement
        </Label>
        <p className="text-sm text-muted-foreground mt-1 mb-3">
          Review and refine your vision for this starship
        </p>
        
        {/* Vision Display/Edit Area */}
        {isEditing ? (
          <>
            <Textarea
              value={editedVision}
              onChange={(e) => {
                setEditedVision(e.target.value);
                setError(null);
              }}
              className={cn(
                "text-lg h-32 resize-none",
                error && "border-red-500 focus:border-red-500"
              )}
              placeholder="Enter your vision..."
              maxLength={500}
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500 mt-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {error}
              </p>
            )}
            <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
              <span>{editedVision.length}/500 characters</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="bg-primary hover:bg-primary/90"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-base italic">
                "{editedVision || initialVision}"
              </p>
              {editedVision !== initialVision && (
                <Badge variant="secondary" className="mt-3">
                  <Edit className="w-3 h-3 mr-1" />
                  Modified
                </Badge>
              )}
            </div>
            <Button
              variant="link"
              size="sm"
              onClick={handleEdit}
              className="mt-2 text-primary"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Vision Statement
            </Button>
          </>
        )}
        
        {/* AI Analysis as suggestions below vision */}
        {analysis && (analysis.suggestedName || analysis.recommendedClass) && (
          <div className="mt-4 space-y-2">
            {analysis.suggestedName && (
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  Suggested name: <span className="font-medium text-foreground">{analysis.suggestedName}</span>
                </span>
              </div>
            )}
            {analysis.recommendedClass && (
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  Recommended class: <Badge variant="outline" className="ml-1">
                    {analysis.recommendedClass === 'scout' ? '🚀 Scout' : '🛸 Cruiser'}
                  </Badge>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tip Section */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Your vision will guide your starship's mission and help AI agents understand your goals. 
          Be specific about what you want to achieve.
        </p>
      </div>
    </div>
  );
}