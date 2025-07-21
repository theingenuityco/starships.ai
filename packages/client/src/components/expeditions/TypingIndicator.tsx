'use client';

import { useState, useEffect } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Bot, Crown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypingUser {
  id: string;
  name: string;
  role: 'user' | 'first-officer' | 'agent' | 'system';
  agentId?: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  className?: string;
}

export function TypingIndicator({ typingUsers, className }: TypingIndicatorProps) {
  const [dots, setDots] = useState('');

  // Animate typing dots
  useEffect(() => {
    if (typingUsers.length === 0) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [typingUsers.length]);

  if (typingUsers.length === 0) return null;

  const getRoleConfig = (role: TypingUser['role']) => {
    switch (role) {
      case 'user':
        return {
          icon: User,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100 dark:bg-blue-900',
          borderColor: 'border-blue-200 dark:border-blue-800'
        };
      case 'first-officer':
        return {
          icon: Crown,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100 dark:bg-purple-900',
          borderColor: 'border-purple-200 dark:border-purple-800'
        };
      case 'agent':
        return {
          icon: Bot,
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900',
          borderColor: 'border-green-200 dark:border-green-800'
        };
      case 'system':
        return {
          icon: Settings,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100 dark:bg-gray-900',
          borderColor: 'border-gray-200 dark:border-gray-800'
        };
      default:
        return {
          icon: User,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100 dark:bg-gray-900',
          borderColor: 'border-gray-200 dark:border-gray-800'
        };
    }
  };

  const formatTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].name} is typing${dots}`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0].name} and ${typingUsers[1].name} are typing${dots}`;
    } else {
      return `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing${dots}`;
    }
  };

  return (
    <div className={cn("flex items-center space-x-2 p-3 animate-fade-in", className)}>
      {/* Avatars */}
      <div className="flex -space-x-2">
        {typingUsers.slice(0, 3).map((user) => {
          const roleConfig = getRoleConfig(user.role);
          const RoleIcon = roleConfig.icon;
          
          return (
            <Avatar
              key={user.id}
              className={cn(
                "h-6 w-6 border-2 border-background",
                roleConfig.bgColor,
                roleConfig.borderColor
              )}
            >
              <RoleIcon className={`h-3 w-3 ${roleConfig.color}`} />
            </Avatar>
          );
        })}
        {typingUsers.length > 3 && (
          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <span className="text-xs text-muted-foreground">+{typingUsers.length - 3}</span>
          </div>
        )}
      </div>

      {/* Typing text */}
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">
          {formatTypingText()}
        </span>
        
        {/* Animated typing dots */}
        <div className="flex space-x-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "w-1 h-1 bg-muted-foreground rounded-full animate-bounce",
                `animation-delay-${i * 200}`
              )}
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: '1.4s'
              }}
            />
          ))}
        </div>
      </div>

      {/* Role badges for multiple users */}
      {typingUsers.length > 1 && (
        <div className="flex space-x-1">
          {Array.from(new Set(typingUsers.map(u => u.role))).map((role) => {
            const roleConfig = getRoleConfig(role);
            const count = typingUsers.filter(u => u.role === role).length;
            
            return (
              <Badge
                key={role}
                variant="outline"
                className={cn("text-xs", roleConfig.color)}
              >
                {role} {count > 1 && `(${count})`}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// CSS for animation delays (add to global CSS)
export const typingIndicatorStyles = `
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }
  
  .animation-delay-0 { animation-delay: 0ms; }
  .animation-delay-200 { animation-delay: 200ms; }
  .animation-delay-400 { animation-delay: 400ms; }
`;