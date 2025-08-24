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
  Eye,
  ArrowRight,
  CheckCircle
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
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5 text-primary" />
          <Label className="text-lg font-semibold">
            Your Vision Statement
          </Label>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Review and refine your vision for this starship
        </p>
        
        {/* Vision Display/Edit Area */}
        {isEditing ? (
          <div className="space-y-3">
            <div className="relative">
              <Textarea
                value={editedVision}
                onChange={(e) => {
                  setEditedVision(e.target.value);
                  setError(null);
                }}
                className={cn(
                  "min-h-[120px] text-base px-4 py-3 resize-none",
                  "bg-background/50 border-2 transition-all",
                  "focus:bg-background focus:border-primary/50",
                  error && "border-destructive focus:border-destructive"
                )}
                placeholder="Enter your vision..."
                maxLength={500}
                autoFocus
              />
              {editedVision && !error && (
                <CheckCircle className="absolute right-3 top-3 w-5 h-5 text-green-500" />
              )}
            </div>
            
            {error && (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            
            <div className="flex items-center justify-between text-sm text-muted-foreground">
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 bg-background/50 rounded-lg border-2 border-border">
              <div className="flex items-start gap-3">
                <Eye className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-base italic">
                    &quot;{editedVision || initialVision}&quot;
                  </p>
                  {editedVision !== initialVision && (
                    <Badge variant="secondary" className="mt-3">
                      <Edit className="w-3 h-3 mr-1" />
                      Modified
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="text-primary hover:text-primary hover:bg-primary/5"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Vision Statement
            </Button>
          </div>
        )}
        
        {/* AI Recommendations Section */}
        {analysis && (analysis.suggestedName || analysis.recommendedClass) && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-primary mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">AI Recommendations</p>
                
                {analysis.suggestedName && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Suggested name:
                    </span>
                    <span className="font-medium text-foreground">
                      {analysis.suggestedName}
                    </span>
                  </div>
                )}
                
                {analysis.recommendedClass && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Recommended class:
                    </span>
                    <Badge variant="secondary">
                      🛸 Cruiser Class
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Tip Section */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Your vision will guide your starship&apos;s mission and help AI agents understand your goals.
          Be specific about what you want to achieve.
        </p>
      </div>
    </div>
  );
}