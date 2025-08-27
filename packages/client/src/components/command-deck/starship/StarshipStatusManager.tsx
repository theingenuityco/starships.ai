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
import {
  Activity,
  Save,
  X,
  Loader2,
  Rocket,
  AlertCircle,
  CheckCircle,
  Circle,
  ArrowRight,
  XCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface StarshipStatusManagerProps {
  starshipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STARSHIP_STATUSES = {
  active: {
    name: 'Active',
    icon: CheckCircle,
    description: 'Currently operational and available for missions',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    iconColor: 'text-green-500',
    benefits: [
      'Full mission capability',
      'All systems operational',
      'Agents can be deployed',
      'Missions can be launched'
    ],
    requirements: [
      'Sufficient power reserves',
      'All systems functional',
      'Crew readiness confirmed'
    ]
  },
  inactive: {
    name: 'Inactive',
    icon: Circle,
    description: 'Currently offline and not available for missions',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    iconColor: 'text-gray-500',
    benefits: [
      'Power conservation',
      'System rest period',
      'Maintenance opportunity',
      'Crew downtime'
    ],
    requirements: [
      'Safe shutdown procedures',
      'Mission completion',
      'System diagnostics clear'
    ]
  },
  disabled: {
    name: 'Disabled',
    icon: XCircle,
    description: 'Subscription ended - starship is disabled',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    iconColor: 'text-red-500',
    benefits: [],
    requirements: []
  },
  restricted: {
    name: 'Restricted',
    icon: AlertCircle,
    description: 'Payment issue - limited functionality',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    iconColor: 'text-orange-500',
    benefits: [],
    requirements: []
  },
  pending_payment: {
    name: 'Payment Required',
    icon: AlertCircle,
    description: 'Payment required to activate starship',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    iconColor: 'text-yellow-500',
    benefits: [],
    requirements: []
  }
} as const;

export function StarshipStatusManager({ 
  starshipId, 
  open, 
  onOpenChange, 
  onSuccess 
}: StarshipStatusManagerProps) {
  const { 
    starships, 
    updateStarshipStatus, 
    loadingStatusUpdate, 
    statusUpdateError, 
    clearError 
  } = useStarshipStore();

  const [selectedStatus, setSelectedStatus] = useState<'active' | 'inactive'>('active');
  const [step, setStep] = useState(1);

  const starship = starships.find(s => s.id === starshipId);
  const currentStatus = starship?.status || 'inactive';
  const statusData = STARSHIP_STATUSES[selectedStatus];

  // Initialize with current status (map system statuses to user-selectable ones)
  useEffect(() => {
    if (starship) {
      // Map system statuses to user-selectable statuses
      const userSelectableStatus = ['disabled', 'restricted', 'pending_payment'].includes(starship.status)
        ? 'inactive'
        : starship.status as 'active' | 'inactive';
      setSelectedStatus(userSelectableStatus);
      setStep(1);
    }
  }, [starship]);

  // Clear errors when modal opens
  useEffect(() => {
    if (open) {
      clearError('status');
    }
  }, [open, clearError]);

  const getStarshipIcon = (starshipClass: 'scout' | 'cruiser' | 'draught') => {
    switch (starshipClass) {
      case 'scout': return '🚀'
      case 'cruiser': return '🛸'
      case 'draught': return '🚢'
      default: return '🚀'
    }
  };

  const handleStatusUpdate = async () => {
    if (!starship || selectedStatus === currentStatus) return;

    try {
      await updateStarshipStatus(starshipId, selectedStatus);
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Failed to update starship status:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (starship) {
      // Map system statuses to user-selectable statuses
      const userSelectableStatus = ['disabled', 'restricted', 'pending_payment'].includes(starship.status)
        ? 'inactive'
        : starship.status as 'active' | 'inactive';
      setSelectedStatus(userSelectableStatus);
    }
    setStep(1);
    clearError('status');
  };

  const handleNext = () => {
    setStep(2);
  };

  const handlePrevious = () => {
    setStep(1);
  };

  const hasStatusChange = selectedStatus !== currentStatus;

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
      <DialogContent className="max-w-3xl bg-background/95 backdrop-blur-sm border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center space-x-2">
            <Activity className="w-6 h-6 text-primary" />
            <span>Status Management</span>
          </DialogTitle>
          <DialogDescription>
            Update your starship&apos;s operational status and configuration
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Current Starship */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Rocket className="w-5 h-5" />
                    <span>{starship.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{getStarshipIcon(starship.class)}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Current Status:</span>
                        <Badge variant="outline" className={STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.color || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}>
                          {React.createElement(STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.icon || Circle, { className: "w-3 h-3 mr-1" })}
                          {STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.name || currentStatus}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.description || 'System-managed status'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Select New Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(STARSHIP_STATUSES).map(([key, status]) => {
                    const StatusIcon = status.icon;
                    const isSelected = selectedStatus === key;
                    const isCurrent = currentStatus === key;
                    
                    return (
                      <Card
                        key={key}
                        className={cn(
                          "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
                          isSelected && "ring-2 ring-primary/50 bg-primary/5",
                          isCurrent && "border-primary/30"
                        )}
                        onClick={() => setSelectedStatus(key as 'active' | 'inactive')}
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center space-x-2">
                            <StatusIcon className={cn("w-5 h-5", status.iconColor)} />
                            <span>{status.name}</span>
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs bg-primary/20 text-primary border-primary/30">
                                Current
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            {status.description}
                          </p>
                          
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Benefits:</div>
                            <ul className="space-y-1">
                              {status.benefits.slice(0, 2).map((benefit, index) => (
                                <li key={index} className="flex items-center space-x-2 text-xs">
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  <span>{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Status Change Preview */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Activity className="w-5 h-5 text-primary" />
                    <span>Status Change Preview</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center space-x-8">
                    {/* Current Status */}
                    <div className="text-center space-y-2">
                      <div className="text-sm text-muted-foreground">Current</div>
                      <Badge variant="outline" className={STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.color || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}>
                        {React.createElement(STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.icon || Circle, { className: "w-3 h-3 mr-1" })}
                        {STARSHIP_STATUSES[currentStatus as keyof typeof STARSHIP_STATUSES]?.name || currentStatus}
                      </Badge>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-6 h-6 text-muted-foreground" />

                    {/* New Status */}
                    <div className="text-center space-y-2">
                      <div className="text-sm text-muted-foreground">New</div>
                      <Badge variant="outline" className={statusData.color}>
                        <statusData.icon className="w-3 h-3 mr-1" />
                        {statusData.name}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* New Status Details */}
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2 text-primary">
                    <statusData.icon className="w-5 h-5" />
                    <span>{statusData.name} Status Details</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    {statusData.description}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="font-medium">Benefits:</div>
                      <ul className="space-y-1">
                        {statusData.benefits.map((benefit, index) => (
                          <li key={index} className="flex items-center space-x-2 text-sm">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <div className="font-medium">Requirements:</div>
                      <ul className="space-y-1">
                        {statusData.requirements.map((requirement, index) => (
                          <li key={index} className="flex items-center space-x-2 text-sm">
                            <Circle className="w-3 h-3 text-muted-foreground" />
                            <span>{requirement}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Impact Notice */}
              {hasStatusChange && (
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      <div className="text-sm">
                        <div className="font-medium">Status Change Impact</div>
                        <div className="text-muted-foreground">
                          Changing status may affect ongoing missions and agent deployments. 
                          Ensure all critical operations are completed before proceeding.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Error Display */}
          {statusUpdateError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{statusUpdateError}</span>
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
              onClick={handleNext}
              disabled={!hasStatusChange}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              Review Change
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handlePrevious}>
                Previous
              </Button>
              <Button
                onClick={handleStatusUpdate}
                disabled={loadingStatusUpdate || !hasStatusChange}
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {loadingStatusUpdate ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Update Status
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