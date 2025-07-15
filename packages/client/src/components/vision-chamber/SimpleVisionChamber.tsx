'use client';

import { useState, useEffect } from 'react';
import { useStarshipStore } from '@/store/starship-store';
import { visionAPI } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eye, Save, Edit, AlertTriangle } from 'lucide-react';

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
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <Eye className="w-8 h-8 mx-auto mb-2" />
          <p>No active starship selected</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold">Vision Statement</h2>
        </div>
        
        {!isEditing && vision.trim().length > 0 && (
          <Button
            onClick={() => setIsEditing(true)}
            variant="outline"
            size="sm"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-4">
          <Textarea
            value={editingVision}
            onChange={(e) => setEditingVision(e.target.value)}
            placeholder="Enter your starship's vision statement..."
            className="min-h-[200px] font-mono"
            disabled={loading}
          />
          <div className="flex gap-2">
            <Button
              onClick={saveVision}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditingVision(vision);
                setIsEditing(false);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="min-h-[200px] p-4 bg-gray-50 rounded border font-mono">
            {vision.trim().length > 0 ? (
              <p className="whitespace-pre-wrap">{vision}</p>
            ) : (
              <p className="text-gray-500 italic">No vision statement yet</p>
            )}
          </div>
          
          {vision.trim().length === 0 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <p className="text-yellow-800 font-medium">Vision Required</p>
              </div>
              <p className="text-yellow-700 text-sm mt-1">
                A vision statement is required before agents can be used. Please create one to enable agent interactions.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}