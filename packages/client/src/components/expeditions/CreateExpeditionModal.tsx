'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { expeditionAPI } from '@/lib/expeditionApi';

interface CreateExpeditionModalProps {
  open: boolean;
  onClose: () => void;
  onExpeditionCreated: () => void;
  starshipId: string;
  starshipSlug: string;
}

interface CreateExpeditionForm {
  title: string;
  description: string;
  objective: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDuration?: number;
  tags: string[];
  dueDate?: string;
}

export function CreateExpeditionModal({
  open,
  onClose,
  onExpeditionCreated,
  starshipId,
  starshipSlug
}: CreateExpeditionModalProps) {
  const [form, setForm] = useState<CreateExpeditionForm>({
    title: '',
    description: '',
    objective: '',
    priority: 'medium',
    estimatedDuration: undefined,
    tags: [],
    dueDate: undefined
  });
  
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.title.trim() || !form.description.trim() || !form.objective.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await expeditionAPI.createExpedition({
        starshipId,
        title: form.title.trim(),
        description: form.description.trim(),
        objective: form.objective.trim(),
        priority: form.priority,
        estimatedDuration: form.estimatedDuration,
        tags: form.tags,
        dueDate: form.dueDate
      });

      // Reset form
      setForm({
        title: '',
        description: '',
        objective: '',
        priority: 'medium',
        estimatedDuration: undefined,
        tags: [],
        dueDate: undefined
      });

      onExpeditionCreated();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create expedition';
      setError(errorMessage);
      console.error('[CREATE EXPEDITION] Failed to create expedition:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      setForm(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Expedition</DialogTitle>
          <DialogDescription>
            Plan a new expedition for starship {starshipSlug}. The First Officer will analyze your requirements and coordinate with available agents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Enter expedition title..."
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              disabled={loading}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe what this expedition is about..."
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              disabled={loading}
              rows={3}
              required
            />
          </div>

          {/* Objective */}
          <div className="space-y-2">
            <Label htmlFor="objective">Objective *</Label>
            <Textarea
              id="objective"
              placeholder="What specific goal should this expedition achieve?"
              value={form.objective}
              onChange={(e) => setForm(prev => ({ ...prev, objective: e.target.value }))}
              disabled={loading}
              rows={3}
              required
            />
          </div>

          {/* Priority and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) =>
                  setForm(prev => ({ ...prev, priority: value as 'low' | 'medium' | 'high' | 'urgent' }))
                }
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Estimated Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                placeholder="e.g., 60"
                value={form.estimatedDuration || ''}
                onChange={(e) => setForm(prev => ({ 
                  ...prev, 
                  estimatedDuration: e.target.value ? parseInt(e.target.value) : undefined 
                }))}
                disabled={loading}
                min="1"
              />
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date (optional)</Label>
            <Input
              id="dueDate"
              type="datetime-local"
              value={form.dueDate || ''}
              onChange={(e) => setForm(prev => ({ ...prev, dueDate: e.target.value || undefined }))}
              disabled={loading}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex space-x-2">
              <Input
                placeholder="Add a tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={loading || !newTag.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center space-x-1">
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={loading}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !form.title.trim() || !form.description.trim() || !form.objective.trim()}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                'Create Expedition'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}