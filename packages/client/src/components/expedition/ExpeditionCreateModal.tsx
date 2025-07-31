'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Rocket } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { expeditionAPI } from '@/lib/expedition-api';
import { agentAPI } from '@/lib/api';
import { ExpeditionAgentSelector } from './ExpeditionAgentSelector';
import type { Agent } from '@/lib/api';

interface ExpeditionCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  starshipId: string;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  description: string;
  agentIds: string[];
}

interface FormErrors {
  name?: string;
  description?: string;
}

export function ExpeditionCreateModal({
  open,
  onOpenChange,
  starshipId,
  onSuccess
}: ExpeditionCreateModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    agentIds: []
  });
  const [errors, setErrors] = useState<FormErrors>({});

  // Load agents when modal opens
  useEffect(() => {
    if (open && starshipId) {
      loadAgents();
    }
  }, [open, starshipId]);

  const loadAgents = async () => {
    try {
      setLoadingAgents(true);
      const fetchedAgents = await agentAPI.getByStarshipId(starshipId);
      setAgents(fetchedAgents);
    } catch (error) {
      console.error('Failed to load agents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load available agents',
        variant: 'destructive'
      });
    } finally {
      setLoadingAgents(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Expedition name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    try {
      setLoading(true);
      await expeditionAPI.create(starshipId, formData);
      
      toast({
        title: 'Expedition created',
        description: 'Your expedition has been created successfully'
      });

      // Reset form and close
      setFormData({ name: '', description: '', agentIds: [] });
      setErrors({});
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to create expedition:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create expedition',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({ name: '', description: '', agentIds: [] });
      setErrors({});
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Create New Expedition
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Expedition Name</Label>
            <Input
              id="name"
              placeholder="Enter expedition name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={loading}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe the expedition's mission"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={loading}
              rows={3}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assign Agents (Optional)</Label>
            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <ExpeditionAgentSelector
                  agents={agents}
                  selectedAgentIds={formData.agentIds}
                  onChange={(agentIds) => setFormData({ ...formData, agentIds })}
                />
              </ScrollArea>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
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
              disabled={loading || loadingAgents}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Expedition
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}