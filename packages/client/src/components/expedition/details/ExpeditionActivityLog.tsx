'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import type { Activity } from '@starships/protocol';

interface ExpeditionActivityLogProps {
  expeditionId: string;
}

export function ExpeditionActivityLog({ expeditionId }: ExpeditionActivityLogProps) {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);

  // Fetch activities
  const fetchActivities = async () => {
    try {
      const response = await api.get(`/api/expeditions/${expeditionId}/activities`);
      setActivities(response.data.activities);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
      if (!isPolling) {
        toast({
          title: 'Error',
          description: 'Failed to load activity log',
          variant: 'destructive'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchActivities();
  }, [expeditionId]);

  // Polling for real-time updates
  useEffect(() => {
    const shouldPoll = activities.some(activity => 
      activity.status === 'in_progress' || activity.type === 'mission_started'
    );

    if (shouldPoll && !isPolling) {
      setIsPolling(true);
      const interval = setInterval(fetchActivities, 2000); // Poll every 2 seconds
      
      return () => {
        clearInterval(interval);
        setIsPolling(false);
      };
    }
  }, [activities, isPolling]);


  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'mission_started':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        );
      case 'web_search':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
      case 'page_visit':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'data_extraction':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'analysis':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      case 'report_generation':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        );
      case 'mission_completed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'mission_started':
        return 'bg-blue-500';
      case 'web_search':
        return 'bg-indigo-500';
      case 'page_visit':
        return 'bg-cyan-500';
      case 'data_extraction':
        return 'bg-purple-500';
      case 'analysis':
        return 'bg-orange-500';
      case 'report_generation':
        return 'bg-green-500';
      case 'mission_completed':
        return 'bg-emerald-500';
      case 'error':
        return 'bg-red-500';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) {
      return 'Just now';
    } else if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Activity Log
      </h2>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Activity log will appear here when mission execution starts
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-700 via-slate-700/50 to-transparent"></div>
            
            <div className="space-y-4 pb-4">
              {activities.map((activity, index) => (
                <div key={activity.id} className="relative flex items-start gap-4 group">
                  {/* Activity dot and icon */}
                  <div className={`relative z-10 w-8 h-8 rounded-full ${getActivityColor(activity.type)} flex items-center justify-center text-white shadow-lg transition-transform group-hover:scale-110`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  
                  {/* Activity content */}
                  <div className="flex-1 bg-slate-800/30 rounded-xl p-4 border border-slate-700/30 transition-all group-hover:bg-slate-800/50 group-hover:border-slate-700/50">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-white">{activity.description}</h3>
                      <span className="text-xs text-slate-500 whitespace-nowrap ml-2">
                        {formatTime(activity.timestamp)}
                      </span>
                    </div>
                    
                    {activity.metadata && (
                      <div className="text-sm text-slate-400 mt-2 space-y-1">
                        {activity.metadata.url && (
                          <p className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <span className="truncate">{activity.metadata.url}</span>
                          </p>
                        )}
                        {activity.metadata.query && (
                          <p>Search: "{activity.metadata.query}"</p>
                        )}
                        {activity.metadata.pageTitle && (
                          <p>Page: {activity.metadata.pageTitle}</p>
                        )}
                        {activity.metadata.progress !== undefined && (
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span>Progress</span>
                              <span>{activity.metadata.progress}%</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-1.5">
                              <div 
                                className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${activity.metadata.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {activity.metadata.error && (
                          <p className="text-red-400">Error: {activity.metadata.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}