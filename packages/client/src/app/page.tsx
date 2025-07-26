'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoginButton } from '@/components/auth/LoginButton';
import { useAuth } from '@/hooks/useAuth';
import { StarfieldBackground } from '@/components/StarfieldBackground';
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
  ChevronDown,
  Star,
  Layers,
  Navigation,
  Github
} from 'lucide-react';


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
    <Card className={`p-6 h-full bg-white/5 backdrop-blur-md border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 ${accent ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}>
      <div className="flex items-start space-x-4">
        <div className={`p-3 rounded-lg ${accent ? 'bg-primary/20' : 'bg-white/10'} group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm`}>
          <Icon className={`w-6 h-6 ${accent ? 'text-primary' : 'text-white/70'} group-hover:text-primary transition-colors`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{title}</h3>
          <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
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
    <Card className={`p-6 h-full bg-white/5 backdrop-blur-md border-white/10 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/20 hover:bg-white/10 ${highlight ? 'ring-2 ring-primary bg-primary/10 scale-105' : 'hover:ring-1 hover:ring-primary/50'}`}>
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
  const [launching, setLaunching] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.8]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || isLoading) return null;

  const handleLaunch = () => {
    setLaunching(true);
    // Don't reset launching state - let it continue until page unloads
    setTimeout(() => {
      if (isAuthenticated) {
        window.location.href = '/ships';
      } else {
        // Trigger login
        const loginButton = document.querySelector('[data-login-button]') as HTMLButtonElement;
        if (loginButton) loginButton.click();
        // Reset launching state after login trigger
        setTimeout(() => setLaunching(false), 3000);
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      <StarfieldBackground launching={launching} density={600} speed={1.5} />
      
      {/* Hero Section */}
      <motion.section 
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pb-20"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8, type: "spring", stiffness: 80 }}
            className="mb-8 relative"
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              width="128"
              height="128"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary mx-auto"
            >
              <motion.path
                d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
              />
              <motion.path
                d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: 0.7 }}
              />
              <motion.path
                d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.3, delay: 0.8 }}
              />
              <motion.circle
                cx="14.5"
                cy="9"
                r="1.5"
                fill="none"
                strokeLinecap="butt"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1.2 }}
                transition={{ duration: 0.2, delay: 0.9 }}
              />
              {/* Three parallel flame lines representing thrust with varied lengths */}
              <motion.line
                x1="6"
                y1="15"
                x2="2.5"
                y2="18.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, delay: 1.0 }}
              />
              <motion.line
                x1="7.5"
                y1="16.5"
                x2="5.4"
                y2="18.6"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, delay: 1.1 }}
              />
              <motion.line
                x1="9"
                y1="18"
                x2="7.6"
                y2="19.4"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, delay: 1.2 }}
              />
            </motion.svg>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1, type: "spring" }}
            className="text-5xl md:text-7xl font-bold mb-6"
          >
            <span className="bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent bg-300% animate-gradient">
              Starships.ai
            </span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed"
          >
            Build and pilot your own <motion.span 
              initial={{ opacity: 0.5 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-primary font-semibold"
            >intelligent vessel</motion.span> 
            <br />powered by your Vision
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            {isAuthenticated ? (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  onClick={handleLaunch}
                  className="relative bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-8 py-4 text-lg rounded-full shadow-lg shadow-primary/25 border border-primary/20 backdrop-blur-sm overflow-hidden group"
                >
                  <span className="relative z-10">Enter Command Deck</span>
                  <ArrowRight className="w-5 h-5 ml-2 relative z-10 group-hover:translate-x-1 transition-transform" />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6 }}
                  />
                </Button>
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <LoginButton 
                  size="lg" 
                  data-login-button
                  className="relative bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-8 py-4 text-lg rounded-full shadow-lg shadow-primary/25 border border-primary/20 backdrop-blur-sm overflow-hidden group"
                >
                  <span className="relative z-10">Launch Your Starship</span>
                  <ArrowRight className="w-5 h-5 ml-2 relative z-10 group-hover:translate-x-1 transition-transform" />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6 }}
                  />
                </LoginButton>
              </motion.div>
            )}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button 
                variant="outline" 
                size="lg" 
                className="px-8 py-4 text-lg rounded-full border-white/20 hover:border-white/40 text-white hover:bg-white/10 backdrop-blur-sm"
              >
                <Github className="w-5 h-5 mr-2" />
                View on GitHub
              </Button>
            </motion.div>
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
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="text-white/50"
          >
            <ChevronDown className="w-6 h-6" />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* System Flow Section */}
      <section className="py-20 px-4 relative bg-black">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900/20 to-black" />
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
      <section className="py-20 px-4 bg-gradient-to-r from-gray-900/50 via-black to-gray-900/50 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="max-w-6xl mx-auto relative z-10">
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
      <section className="py-20 px-4 relative bg-black">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10" />
        <motion.div 
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(var(--primary-rgb), 0.3) 0%, transparent 70%)'
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
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
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  onClick={handleLaunch}
                  className="relative bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-8 py-4 text-lg rounded-full shadow-lg shadow-primary/25 border border-primary/20 backdrop-blur-sm overflow-hidden group"
                >
                  <span className="relative z-10">
                    <Rocket className="w-5 h-5 mr-2 inline" />
                    Enter Command Deck
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6 }}
                  />
                </Button>
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  onClick={handleLaunch}
                  size="lg" 
                  className="relative bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground px-8 py-4 text-lg rounded-full shadow-lg shadow-primary/25 border border-primary/20 backdrop-blur-sm overflow-hidden group"
                >
                  <span className="relative z-10">
                    <Rocket className="w-5 h-5 mr-2 inline" />
                    Begin Your Journey
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6 }}
                  />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-gray-400">
                © 2024 Starships.ai - Where Vision meets Intelligence
              </p>
            </div>
            <div className="flex space-x-6">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/10">
                <Github className="w-4 h-4 mr-2" />
                GitHub
              </Button>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/10">Documentation</Button>
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-white/10">Community</Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
} 