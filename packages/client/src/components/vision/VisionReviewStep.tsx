'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Eye,
  Edit,
  Check,
  X,
  Sparkles,
  AlertCircle,
  Lightbulb
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
      {/* Vision Display/Edit Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="w-5 h-5 text-primary" />
              <span>Your Vision</span>
            </div>
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="hover:bg-primary/10"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <Textarea
                  value={editedVision}
                  onChange={(e) => {
                    setEditedVision(e.target.value);
                    setError(null);
                  }}
                  className={cn(
                    "min-h-[100px] resize-none",
                    error && "border-destructive focus:border-destructive"
                  )}
                  placeholder="Enter your vision..."
                  maxLength={500}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {editedVision.length}/500 characters
                  </span>
                  {error && (
                    <p className="text-xs text-destructive flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {error}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-foreground leading-relaxed">
                {editedVision || initialVision}
              </p>
              {editedVision !== initialVision && (
                <Badge variant="secondary" className="text-xs">
                  <Edit className="w-3 h-3 mr-1" />
                  Edited
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Analysis Card */}
      {analysis && (
        <Card className="border-primary/10 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span>Sibil's Analysis</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Summary</Label>
              <p className="text-sm mt-1">{analysis.summary}</p>
            </div>
            
            {analysis.suggestedName && (
              <div>
                <Label className="text-sm text-muted-foreground">Suggested Name</Label>
                <p className="text-sm mt-1 font-medium">{analysis.suggestedName}</p>
              </div>
            )}
            
            {analysis.recommendedClass && (
              <div>
                <Label className="text-sm text-muted-foreground">Recommended Class</Label>
                <Badge variant="outline" className="mt-1">
                  {analysis.recommendedClass === 'scout' ? '🚀' : '🛸'} {analysis.recommendedClass}
                </Badge>
              </div>
            )}
            
            {analysis.keywords && analysis.keywords.length > 0 && (
              <div>
                <Label className="text-sm text-muted-foreground">Key Themes</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {analysis.keywords.map((keyword, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {analysis.confidence && (
              <div>
                <Label className="text-sm text-muted-foreground">Confidence</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="flex-1 bg-background/50 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${analysis.confidence * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(analysis.confidence * 100)}%
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tips Card */}
      <Card className="border-muted/50 bg-muted/10">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Lightbulb className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Vision Tips</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Be specific about what you want to build</li>
                <li>• Focus on the problem you're solving</li>
                <li>• Consider your target users</li>
                <li>• Think about the unique value you'll create</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        {allowSkip && (
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground"
          >
            Skip Vision
          </Button>
        )}
        <div className="flex space-x-2 ml-auto">
          <Button
            onClick={handleConfirm}
            disabled={isEditing}
            className="bg-primary hover:bg-primary/90"
          >
            Confirm Vision
            <Check className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}