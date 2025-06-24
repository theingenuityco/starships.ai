'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { useStarship } from '@/components/state/starship-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ThemeToggle } from '@/components/theme-toggle';
import { 
  Rocket, 
  Users, 
  Brain, 
  Zap, 
  BookOpen, 
  Eye,
  Settings,
  ArrowRight
} from 'lucide-react';

const dashboardItems = [
  {
    href: '/crew',
    title: 'Crew Console',
    description: 'Manage your agents and communication',
    icon: Users,
    emoji: '👥',
    status: 'active'
  },
  {
    href: '/core',
    title: 'Aether Core',
    description: 'Vision planning and knowledge codex',
    icon: Brain,
    emoji: '🧠',
    status: 'coming-soon'
  },
  {
    href: '/expeditions',
    title: 'Expeditions',
    description: 'Track missions and outcomes',
    icon: Rocket,
    emoji: '🚀',
    status: 'coming-soon'
  },
  {
    href: '/drive',
    title: 'Aether Drive',
    description: 'Resource management and optimization',
    icon: Zap,
    emoji: '🔋',
    status: 'coming-soon'
  },
  {
    href: '/logbook',
    title: 'Logbook',
    description: 'History, insights, and learning',
    icon: BookOpen,
    emoji: '📚',
    status: 'coming-soon'
  },
  {
    href: '/sibil',
    title: 'Sibil Companion',
    description: 'Your AI advisor and guide',
    icon: Eye,
    emoji: '👁️',
    status: 'coming-soon'
  },
];

export function Dashboard() {
  const { state } = useStarship();

  return (
    <div className="min-h-screen command-deck-bg p-8">
      {/* Header */}
      <motion.div
        className="mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-2xl font-bold">🛸</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold starship-accent">Starships.ai</h1>
              <p className="text-xl text-muted-foreground">Command Center</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <motion.button
              className="p-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Settings className="w-5 h-5" />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Starship Status */}
      <motion.div
        className="mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="bg-card/50 backdrop-blur-sm border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>⚡</span>
              <span className="capitalize starship-accent">{state.class} Class Starship</span>
            </CardTitle>
            <CardDescription>
              {state.currentMission && `Current Mission: ${state.currentMission}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🔋</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Aether Drive</span>
                    <span className="text-sm text-muted-foreground">{state.powerLevel}%</span>
                  </div>
                  <Progress value={state.powerLevel} className="h-2" />
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <div className="text-sm font-medium">Active Expeditions</div>
                  <div className="text-2xl font-bold starship-accent">{state.activeExpeditions}</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <span className="text-2xl">👁️</span>
                <div>
                  <div className="text-sm font-medium">Sibil Insights</div>
                  <div className="text-2xl font-bold starship-accent">{state.sibilInsights}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Navigation Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {dashboardItems.map((item, index) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
          >
            <Link href={item.href}>
              <Card className={`group cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 ${
                item.status === 'active' 
                  ? 'bg-card border-2 border-primary/20 hover:border-primary/40' 
                  : 'bg-card/50 hover:bg-card/80'
              }`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">{item.emoji}</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        <CardDescription className="text-sm">
                          {item.description}
                        </CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant={item.status === 'active' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {item.status === 'active' ? 'Active' : 'Coming Soon'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
} 