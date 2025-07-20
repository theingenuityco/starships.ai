'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  Loader2,
  Rocket,
  AlertCircle,
  Users,
  Navigation
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface StarshipDeleteDialogProps {
  starshipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function StarshipDeleteDialog({ 
  starshipId, 
  open, 
  onOpenChange, 
  onSuccess 
}: StarshipDeleteDialogProps) {
  const { 
    starships, 
    activeStarshipId,
    deleteStarship, 
    loadingDelete, 
    deleteError, 
    clearError,
    starshipAgents
  } = useStarshipStore();

  const [confirmationText, setConfirmationText] = useState('');
  const [step, setStep] = useState(1);

  const starship = starships.find(s => s.id === starshipId);
  const isActiveStarship = activeStarshipId === starshipId;
  const agentData = starshipAgents[starshipId];
  const deployedAgents = agentData?.deployedAgents || [];

  // Clear state when modal opens/closes
  useEffect(() => {
    if (open) {
      clearError('delete');
      setConfirmationText('');
      setStep(1);
    }
  }, [open, clearError]);

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser') => {
    return starshipClass === 'scout' ? '🚀' : '🛸';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'docked': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'maintenance': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const isConfirmationValid = confirmationText === starship?.name;

  const handleDelete = async () => {
    if (!starship || !isConfirmationValid) return;

    try {
      await deleteStarship(starshipId);
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to delete starship:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setConfirmationText('');
    setStep(1);
    clearError('delete');
  };

  const handleNext = () => {
    setStep(2);
  };

  const handlePrevious = () => {
    setStep(1);
  };

  if (!starship) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-sm border-border/50">
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-muted-foreground">Starship not found</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-sm border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center space-x-2 text-destructive">
            <AlertTriangle className="w-6 h-6" />
            <span>Delete Starship</span>
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. Please review the consequences carefully.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Starship Info */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Rocket className="w-5 h-5" />
                    <span>Starship to Delete</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{getStarshipIcon(starship.class)}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{starship.name}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className={getStatusColor(starship.status)}>
                          {starship.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {starship.class}
                        </Badge>
                        {isActiveStarship && (
                          <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-1 text-muted-foreground">
                        <Users className="w-3 h-3" />
                        <span className="text-xs">Deployed Agents</span>
                      </div>
                      <div className="text-lg font-semibold">{deployedAgents.length}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center space-x-1 text-muted-foreground">
                        <Navigation className="w-3 h-3" />
                        <span className="text-xs">Active Expeditions</span>
                      </div>
                      <div className="text-lg font-semibold">{starship.maxActiveExpeditions}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Warnings */}
              <div className="space-y-4">
                <Card className="bg-destructive/5 border-destructive/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center space-x-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      <span>Deletion Consequences</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-destructive rounded-full mt-2" />
                      <div>
                        <div className="font-medium">Permanent Data Loss</div>
                        <div className="text-sm text-muted-foreground">
                          All starship data, including configuration and history, will be permanently deleted
                        </div>
                      </div>
                    </div>
                    
                    {deployedAgents.length > 0 && (
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-destructive rounded-full mt-2" />
                        <div>
                          <div className="font-medium">Agent Deployment</div>
                          <div className="text-sm text-muted-foreground">
                            {deployedAgents.length} deployed agent{deployedAgents.length > 1 ? 's' : ''} will be undeployed
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {starship.maxActiveExpeditions > 0 && (
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-destructive rounded-full mt-2" />
                        <div>
                          <div className="font-medium">Active Expeditions</div>
                          <div className="text-sm text-muted-foreground">
                            {starship.maxActiveExpeditions} active expedition{starship.maxActiveExpeditions > 1 ? 's' : ''} will be terminated
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {isActiveStarship && (
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 bg-destructive rounded-full mt-2" />
                        <div>
                          <div className="font-medium">Active Starship</div>
                          <div className="text-sm text-muted-foreground">
                            This is your currently active starship. You'll need to select another one.
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Confirmation */}
              <Card className="bg-destructive/5 border-destructive/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <span>Confirm Deletion</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    To confirm deletion, please type the starship name exactly as shown:
                  </p>
                  
                  <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                    <div className="font-mono text-sm">{starship.name}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmation">Confirmation</Label>
                    <Input
                      id="confirmation"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      placeholder="Type the starship name here..."
                      className={cn(
                        "bg-background/50 backdrop-blur-sm border-border/50",
                        confirmationText && !isConfirmationValid && "border-destructive"
                      )}
                    />
                    {confirmationText && !isConfirmationValid && (
                      <p className="text-sm text-destructive">
                        Name doesn't match. Please type exactly: {starship.name}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Final Warning */}
              <Card className="bg-destructive/10 border-destructive/30">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                    <div className="text-sm">
                      <strong>Warning:</strong> This action is irreversible. 
                      The starship "{starship.name}" and all associated data will be permanently deleted.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Error Display */}
          {deleteError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{deleteError}</span>
              </div>
            </motion.div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          
          {step === 1 ? (
            <Button 
              variant="destructive" 
              onClick={handleNext}
              className="bg-destructive hover:bg-destructive/90"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Continue
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handlePrevious}>
                Previous
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loadingDelete || !isConfirmationValid}
                className="bg-destructive hover:bg-destructive/90"
              >
                {loadingDelete ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Starship
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}