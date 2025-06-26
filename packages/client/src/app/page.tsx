'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LoginButton } from '@/components/auth/LoginButton';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { 
  Sparkles, 
  Rocket, 
  Brain, 
  Eye, 
  Compass, 
  Zap, 
  Users, 
  Book, 
  ArrowRight,
  Github,
  ChevronDown,
  Star,
  Orbit,
  Target,
  Layers,
  Navigation
} from 'lucide-react';

// Floating particles component for cosmic effect
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(20)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-1 h-1 bg-primary/20 rounded-full"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
        }}
        animate={{
          y: [0, -100, 0],
          opacity: [0, 1, 0],
          scale: [0, 1, 0],
        }}
        transition={{
          duration: 3 + Math.random() * 2,
          repeat: Infinity,
          delay: Math.random() * 2,
        }}
      />
    ))}
  </div>
);

// System component cards
const SystemCard = ({ icon: Icon, title, description, accent = false }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    whileHover={{ y: -5, transition: { duration: 0.2 } }}
    className="group"
  >
    <Card className={`p-6 h-full bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-300 hover:bg-card/80 hover:border-primary/30 ${accent ? 'ring-1 ring-primary/20' : ''}`}>
      <div className="flex items-start space-x-4">
        <div className={`p-3 rounded-lg ${accent ? 'bg-primary/10' : 'bg-secondary/50'} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-6 h-6 ${accent ? 'text-primary' : 'text-muted-foreground'} group-hover:text-primary transition-colors`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </Card>
  </motion.div>
);

// Starship class showcase
const StarshipClass = ({ name, description, features, highlight = false }: {
  name: string;
  description: string;
  features: string[];
  highlight?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    whileInView={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.6 }}
    className="group"
  >
    <Card className={`p-6 h-full transition-all duration-300 hover:shadow-xl ${highlight ? 'ring-2 ring-primary bg-primary/5' : 'hover:ring-1 hover:ring-primary/30'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{name}</h3>
        {highlight && <Badge className="bg-primary/10 text-primary">Recommended</Badge>}
      </div>
      <p className="text-muted-foreground mb-4 leading-relaxed">{description}</p>
      <ul className="space-y-2">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center space-x-2 text-sm">
            <Star className="w-4 h-4 text-primary" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  </motion.div>
);

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isLoading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 relative overflow-hidden">
      <FloatingParticles />
      
      {/* Hero Section */}
      <motion.section 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative h-screen flex flex-col items-center justify-center text-center px-4"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
        
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
            className="mb-8"
          >
            <div className="inline-flex items-center justify-center w-24 h-24 bg-primary/10 rounded-full mb-6">
              <Rocket className="w-12 h-12 text-primary" />
            </div>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent"
          >
            Starships.ai
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed"
          >
            Build and pilot your own <strong className="text-primary">intelligent vessel</strong> 
            <br />powered by your Vision
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            {isAuthenticated ? (
              <Link href="/crew">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg rounded-full">
                  Enter Command Deck
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            ) : (
              <LoginButton size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg rounded-full">
                Launch Your Starship
                <ArrowRight className="w-5 h-5 ml-2" />
              </LoginButton>
            )}
            <Button variant="outline" size="lg" className="px-8 py-4 text-lg rounded-full">
              <Github className="w-5 h-5 mr-2" />
              View on GitHub
            </Button>
          </motion.div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-muted-foreground"
          >
            <ChevronDown className="w-6 h-6" />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* System Flow Section */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-background" />
        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">The Starship Journey</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              You arrive with a <strong className="text-primary">Vision</strong>, inscribe it into <strong className="text-primary">The Codex</strong>, 
              guided by <strong className="text-primary">The Echo</strong>, launch <strong className="text-primary">Expeditions</strong> powered by the <strong className="text-primary">Aether Drive</strong>
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <SystemCard
              icon={Eye}
              title="Vision"
              description="The foundational intent behind your Starship. Not just a goal, but a long-term dream that drives everything else."
              accent
            />
            <SystemCard
              icon={Book}
              title="The Codex"
              description="A living, persistent artifact that reflects your Vision's current state. Where purpose becomes programmable."
            />
            <SystemCard
              icon={Brain}
              title="Aether Cortex"
              description="The synthetic mind of your Starship. Orchestrates your Crew, maintains mission state, and translates Vision into action."
            />
            <SystemCard
              icon={Sparkles}
              title="The Echo"
              description="Your reflective companion. A semi-sentient entity that helps refine your Vision and monitor alignment."
            />
            <SystemCard
              icon={Compass}
              title="Expeditions"
              description="Scoped, executable ventures that fulfill pieces of your Vision. Each has a goal, context, timeline, and output."
            />
            <SystemCard
              icon={Zap}
              title="Aether Drive"
              description="The engine that converts time, compute, and tokens into meaningful progress. Powers your Starship's operations."
            />
            <SystemCard
              icon={Navigation}
              title="Command Deck"
              description="Your control center. Launch Expeditions, monitor agent activity, and command your living vessel."
            />
            <SystemCard
              icon={Users}
              title="Crew"
              description="Intelligent agents specialized for different tasks. Your Crew carries out the work of your Expeditions."
            />
            <SystemCard
              icon={Layers}
              title="Starship Class"
              description="Determines your vessel's capabilities: max Crew slots, concurrent Expeditions, and burn rate ceiling."
            />
          </div>
        </div>
      </section>

      {/* Starship Classes Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-secondary/20 via-background to-secondary/20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Choose Your Starship Class</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Each class shapes your strategy and scale. Start small or go big—your Vision determines the path.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StarshipClass
              name="Scout Class"
              description="Perfect for focused exploration and individual missions. Efficient and nimble."
              features={[
                "3 Crew Members",
                "1 Concurrent Expedition",
                "Minimal Burn Rate",
                "Quick Deployment"
              ]}
            />
            <StarshipClass
              name="Cruiser Class"
              description="Balanced power and capability. Ideal for ambitious projects and sustained operations."
              features={[
                "6-8 Crew Members",
                "Up to 3 Expeditions",
                "Moderate Burn Rate",
                "Advanced Coordination"
              ]}
              highlight
            />
            <StarshipClass
              name="Dreadnought Class"
              description="Maximum capability for complex, multi-faceted Visions. Built for large-scale operations."
              features={[
                "12+ Crew Members",
                "Unlimited Expeditions",
                "High Burn Rate",
                "Epic Scale Missions"
              ]}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Launch?</h2>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Your Vision awaits. Build your Starship, assemble your Crew, and embark on the journey 
              that transforms intention into reality.
            </p>
            {isAuthenticated ? (
              <Link href="/crew">
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg rounded-full">
                  <Rocket className="w-5 h-5 mr-2" />
                  Enter Command Deck
                </Button>
              </Link>
            ) : (
              <LoginButton size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg rounded-full">
                <Rocket className="w-5 h-5 mr-2" />
                Begin Your Journey
              </LoginButton>
            )}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-muted-foreground">
                © 2024 Starships.ai - Where Vision meets Intelligence
              </p>
            </div>
            <div className="flex space-x-6">
              <Button variant="ghost" size="sm">
                <Github className="w-4 h-4 mr-2" />
                GitHub
              </Button>
              <Button variant="ghost" size="sm">Documentation</Button>
              <Button variant="ghost" size="sm">Community</Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
} 