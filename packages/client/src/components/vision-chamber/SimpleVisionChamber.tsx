'use client';

import { useState, useEffect } from 'react';
import { useStarshipStore } from '@/store/starship-store';
import { visionAPI } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, Save, Edit, AlertTriangle, Sparkles, Target, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function SimpleVisionChamber() {
  const { activeStarshipId } = useStarshipStore();
  const [vision, setVision] = useState('');
  const [editingVision, setEditingVision] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load vision on mount
  useEffect(() => {
    if (activeStarshipId) {
      loadVision();
    }
  }, [activeStarshipId]);

  // Auto-edit if empty
  useEffect(() => {
    if (vision.trim().length === 0) {
      setIsEditing(true);
    }
  }, [vision]);

  const loadVision = async () => {
    if (!activeStarshipId) return;
    
    setLoading(true);
    try {
      const data = await visionAPI.get(activeStarshipId);
      setVision(data.vision || '');
      setEditingVision(data.vision || '');
    } catch (err) {
      setError('Failed to load vision');
    } finally {
      setLoading(false);
    }
  };

  const saveVision = async () => {
    if (!activeStarshipId) return;
    
    setLoading(true);
    try {
      await visionAPI.save(activeStarshipId, editingVision);
      setVision(editingVision);
      setIsEditing(false);
      setError('');
    } catch (err) {
      setError('Failed to save vision');
    } finally {
      setLoading(false);
    }
  };

  if (!activeStarshipId) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-md w-full bg-card/50 backdrop-blur-sm border-border/50 shadow-xl">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="absolute inset-0 bg-purple-500/10 blur-xl" />
                <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-4 rounded-2xl">
                  <Eye className="w-8 h-8 text-purple-500" />
                </div>
              </div>
              <p className="text-muted-foreground">No active starship selected</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-auto bg-gradient-to-b from-background to-background/95">
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <Card className="bg-red-500/10 border-red-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-xl">
          <CardHeader className="border-b border-border/40">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-500/10 blur-sm" />
                  <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-2.5 rounded-xl">
                    <Eye className="w-5 h-5 text-purple-500" />
                  </div>
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold">Vision Statement</CardTitle>
                  <p className="text-sm text-muted-foreground">Define your starship's guiding purpose</p>
                </div>
              </div>
              
              {!isEditing && vision.trim().length > 0 && (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  size="sm"
                  className="hover:bg-purple-500/10 hover:border-purple-500/50"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Vision
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {isEditing ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="relative">
                  <Textarea
                    value={editingVision}
                    onChange={(e) => setEditingVision(e.target.value)}
                    placeholder="Enter your starship's vision statement..."
                    className="min-h-[250px] resize-none bg-background/50 border-border/50 focus:border-purple-500/50 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors text-base leading-relaxed"
                    disabled={loading}
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                    {editingVision.length} characters
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    onClick={saveVision}
                    disabled={loading || !editingVision.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {loading ? 'Saving...' : 'Save Vision'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingVision(vision);
                      setIsEditing(false);
                    }}
                    disabled={loading}
                    className="hover:bg-muted"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {vision.trim().length > 0 ? (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-xl" />
                      <div className="relative min-h-[250px] p-6 bg-gradient-to-br from-background/80 to-background/60 rounded-xl border border-border/50">
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
                          {vision}
                        </p>
                      </div>
                    </div>

                    {/* Vision insights */}
                    <div className="grid md:grid-cols-3 gap-4">
                      <Card className="bg-gradient-to-br from-purple-500/5 to-transparent border-purple-500/20">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 w-4 text-purple-500" />
                            <span className="text-sm font-medium">Vision Clarity</span>
                          </div>
                          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                            Strong
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-gradient-to-br from-blue-500/5 to-transparent border-blue-500/20">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium">Alignment</span>
                          </div>
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            Active
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-gradient-to-br from-green-500/5 to-transparent border-green-500/20">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="w-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Impact</span>
                          </div>
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            High
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="min-h-[250px] p-6 bg-muted/30 rounded-xl border border-dashed border-border/50 flex items-center justify-center">
                      <p className="text-muted-foreground italic text-center">
                        No vision statement yet. Click below to create one.
                      </p>
                    </div>
                    
                    <Card className="bg-yellow-500/10 border-yellow-500/20">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                              Vision Statement Required
                            </p>
                            <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                              A vision statement is required before agents can be used. Please create one to enable agent interactions and unlock your starship's full potential.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}