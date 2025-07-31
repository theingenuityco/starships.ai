'use client';

import { useState } from 'react';

interface ActivityItem {
  id: string;
  type: 'created' | 'agent_assigned' | 'message_sent' | 'status_changed';
  timestamp: Date;
  description: string;
  metadata?: Record<string, any>;
}

export function ExpeditionActivityLog() {
  const [activities] = useState<ActivityItem[]>([
    {
      id: '1',
      type: 'created',
      timestamp: new Date(Date.now() - 7200000),
      description: 'Expedition Alpha Mission created',
      metadata: { initiator: 'Commander Chen' }
    },
    {
      id: '2',
      type: 'agent_assigned',
      timestamp: new Date(Date.now() - 6000000),
      description: 'Science Officer AI assigned to expedition',
      metadata: { agentName: 'Science Officer AI', agentId: 'sci-001' }
    },
    {
      id: '3',
      type: 'agent_assigned',
      timestamp: new Date(Date.now() - 5400000),
      description: 'Navigation AI assigned to expedition',
      metadata: { agentName: 'Navigation AI', agentId: 'nav-001' }
    },
    {
      id: '4',
      type: 'status_changed',
      timestamp: new Date(Date.now() - 3600000),
      description: 'Expedition status changed to Active',
      metadata: { previousStatus: 'Preparing', newStatus: 'Active' }
    },
    {
      id: '5',
      type: 'message_sent',
      timestamp: new Date(Date.now() - 3000000),
      description: 'Commander initiated communication',
      metadata: { messagePreview: 'Acknowledged. Beginning preliminary scans...' }
    },
    {
      id: '6',
      type: 'message_sent',
      timestamp: new Date(Date.now() - 2400000),
      description: 'Science Officer AI reported findings',
      metadata: { messagePreview: 'Detecting unusual energy signatures...' }
    }
  ]);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'created':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case 'agent_assigned':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'message_sent':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      case 'status_changed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
    }
  };

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'created':
        return 'bg-blue-500';
      case 'agent_assigned':
        return 'bg-green-500';
      case 'message_sent':
        return 'bg-purple-500';
      case 'status_changed':
        return 'bg-yellow-500';
    }
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) {
      return `${minutes} minutes ago`;
    } else if (hours < 24) {
      return `${hours} hours ago`;
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
        {activities.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Activity log will appear here
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
                      <div className="text-sm text-slate-400 mt-2">
                        {activity.metadata.initiator && (
                          <p>Initiated by: {activity.metadata.initiator}</p>
                        )}
                        {activity.metadata.agentName && (
                          <p>Agent: {activity.metadata.agentName}</p>
                        )}
                        {activity.metadata.previousStatus && (
                          <p>Status: {activity.metadata.previousStatus} → {activity.metadata.newStatus}</p>
                        )}
                        {activity.metadata.messagePreview && (
                          <p className="italic">"{activity.metadata.messagePreview}"</p>
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