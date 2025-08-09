'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Target, Users, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { missionApi } from '@/lib/missionApi';
import { starshipAPI } from '@/lib/api';
import type { Mission, MissionStatus } from '@starships/protocol';

interface MissionDetailPageProps {
  params: Promise<{
    slug: string;
    missionId: string;
  }>;
}

const statusColors: Record<MissionStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-yellow-100 text-yellow-800'
};

const statusIcons: Record<MissionStatus, React.ReactNode> = {
  draft: <Clock className="w-4 h-4" />,
  active: <Target className="w-4 h-4" />,
  completed: <Target className="w-4 h-4" />,
  failed: <Target className="w-4 h-4" />,
  cancelled: <Target className="w-4 h-4" />
};

export default function MissionDetailPage({ params }: MissionDetailPageProps) {
  const { slug, missionId } = use(params);
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMission = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await missionApi.getMissionById(missionId);
        
        if (response.error) {
          setError(response.error);
        } else if (response.data) {
          setMission(response.data.mission);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load mission');
      } finally {
        setLoading(false);
      }
    };

    loadMission();
  }, [missionId]);

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="h-full command-deck-bg p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div className="h-full command-deck-bg p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">⚠️ Error</div>
          <p className="text-muted-foreground mb-4">{error || 'Mission not found'}</p>
          <Button onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full command-deck-bg p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Missions
          </Button>
          <div className="flex items-center gap-2">
            {statusIcons[mission.status]}
            <h1 className="text-3xl font-bold">{mission.name}</h1>
            <Badge className={statusColors[mission.status]}>
              {mission.status}
            </Badge>
          </div>
        </div>

        {/* Mission Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Mission Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{mission.description}</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(mission.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Last Updated</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(mission.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Assigned Agents</p>
                  <p className="text-sm text-muted-foreground">
                    {mission.agentIds?.length || 0} agent{(mission.agentIds?.length || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Blank Canvas Area */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Mission Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center border-2 border-dashed border-muted rounded-lg">
              <div className="text-center">
                <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Mission Canvas</h3>
                <p className="text-muted-foreground">
                  This is where mission execution and collaboration will happen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}