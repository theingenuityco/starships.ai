'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useState, useRef, memo, useCallback, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DynamicLoginButton } from '@/components/auth/DynamicLoginButton';
import { StarTheme } from '@/components/theme-context';
import { useAuth } from '@/hooks/useAuth';
import { LandingSibilWidgetStaticChat } from '@/components/onboarding/LandingSibilWidgetStaticChat';
import { LandingSibilWidgetAuthenticated } from '@/components/onboarding/LandingSibilWidgetAuthenticated';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { ReturnFlowBanner } from '@/components/onboarding/ReturnFlow';
import { useStarshipStore } from '@/store/starship-store';
const StarfieldBackground = lazy(() => import('@/components/StarfieldBackground').then(module => ({ default: module.StarfieldBackground })));
import { 
  Sparkles, 
  Rocket, 
  Brain, 
  Eye, 
  Compass, 
  Zap, 
  Users, 
  User,
  Book, 
  ArrowRight,
  ChevronDown,
  Star,
  Layers,
  Navigation,
  GithubIcon,
  Lightbulb,
  Minus
} from 'lucide-react';


// System component cards
const SystemCard = memo(({ icon: Icon, title, description, accent = false, imageContent }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent?: boolean;
  imageContent?: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    whileHover={{ y: -5, transition: { duration: 0.2 } }}
    className="group max-w-2xl mx-auto"
  >
    <Card className={`p-8 bg-white/5 backdrop-blur-md border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 relative overflow-hidden ${accent ? 'ring-1 ring-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent' : 'bg-gradient-to-br from-white/5 via-white/3 to-transparent'}`}>
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-3 rounded-lg ${accent ? 'bg-primary/20' : 'bg-white/10'} group-hover:scale-110 transition-transform duration-300 backdrop-blur-sm`}>
              <Icon className={`w-7 h-7 ${accent ? 'text-primary' : 'text-white/70'} group-hover:text-primary transition-colors`} />
            </div>
            <h3 className="font-semibold text-xl group-hover:text-primary transition-colors">{title}</h3>
          </div>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </div>
        {imageContent && (
          <div className="flex justify-center">
            {imageContent}
          </div>
        )}
      </div>
    </Card>
  </motion.div>
));

SystemCard.displayName = 'SystemCard';

// Starship class showcase
const StarshipClass = memo(({ name, description, features, highlight = false }: {
  name: string;
  description: string;
  features: string[];
  highlight?: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.3 }}
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
));

StarshipClass.displayName = 'StarshipClass';

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [hasVision, setHasVision] = useState(false);
  const [hasExistingStarships, setHasExistingStarships] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();
  const { scrollYProgress } = useScroll();
  const { session } = useOnboardingSession();
  const { starships, loadUserStarships } = useStarshipStore();


  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Check for existing starships for authenticated users
    if (isAuthenticated && !isLoading) {
      loadUserStarships().then(() => {
        if (starships && starships.length > 0) {
          setHasExistingStarships(true);
        }
      });
    }
  }, [isAuthenticated, isLoading, loadUserStarships]);

  // Check if user has a vision in session
  useEffect(() => {
    if (session?.pendingVision) {
      setHasVision(true);
    }
  }, [session]);

  if (!mounted || isLoading) return null;

  const handleLaunch = () => {
    setLaunching(true);
    // Don't reset launching state - let it continue until page unloads
    setTimeout(() => {
      if (isAuthenticated) {
        // If user has no starships and has a vision, go through onboarding flow
        if (!hasExistingStarships && hasVision) {
          window.location.href = '/fleet?onboarding=true';
        } else {
          window.location.href = '/fleet';
        }
      } else {
        // Trigger login
        const loginButton = document.querySelector('[data-login-button]') as HTMLButtonElement;
        if (loginButton) loginButton.click();
        // Reset launching state after login trigger
        setTimeout(() => setLaunching(false), 3000);
      }
    }, 1000);
  };

  const handleVisionSubmit = (vision: string, analysis: any) => {
    setHasVision(true);
    // The vision is already saved in session by the widget
    // Just update our local state to transform the button
  };

  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden">
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
        <StarfieldBackground launching={launching} density={600} speed={1.5} />
      </Suspense>
      
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 p-6">
        <div className="flex justify-between items-center">
          {/* Logo/Brand (empty div for spacing) */}
          <div></div>
          
          {/* Right side buttons */}
          <div className="flex gap-4">
            {!isAuthenticated && (
              <DynamicLoginButton 
                size="default" 
                data-login-button
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-full"
                preserveOnboarding={true}
                showIcon={false}
              >
                Login
              </DynamicLoginButton>
            )}
            <Button 
              variant="outline" 
              size="default" 
              className="px-6 py-2 rounded-full backdrop-blur-sm border-white/20 text-white hover:bg-white/10"
            >
              <Book className="w-4 h-4 mr-2" />
              View Documentation
            </Button>
          </div>
        </div>
      </div>

      {/* Return Flow Banner for users with abandoned sessions */}
      {!isAuthenticated && (
        <ReturnFlowBanner />
      )}
      
      {/* Hero Section */}
      <motion.section 
        className="relative min-h-screen flex flex-col items-center justify-center px-4 pb-20"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60 pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.85 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.9 }}
          transition={{ 
            duration: 0.8,
            ease: [0.25, 0.1, 0.25, 1]
          }}
          viewport={{ once: false, margin: "-10%" }}
          className="relative z-10 w-full px-8"
        >
          <div className="flex items-center justify-center gap-8">
            {/* Rocket Logo on the left */}
            <motion.div
              initial={{ scale: 0, x: -50 }}
              animate={{ scale: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.8, type: "spring", stiffness: 80 }}
              className="relative flex-shrink-0"
            >
              <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                width="120"
                height="120"
                viewBox="0 0 24 24"
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
              <defs>
                <motion.linearGradient
                  id="gradient"
                  x1="0%"
                  y1="75%"
                  x2="100%"
                  y2="0%"
                  animate={{
                    x1: ["-150%", "150%"],
                    x2: ["-50%", "250%"],
                    y1: ["150%", "-50%"],
                    y2: ["100%", "-100%"]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "easeInOut",
                    repeatDelay: 10,
                    delay: 2
                  }}
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
                  <stop offset="12%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="15%" stopColor="white" />
                  <stop offset="18%" stopColor="rgba(255,255,255,0.8)" />
                  <stop offset="20%" stopColor="rgba(255,255,255,0.5)" />
                  <stop offset="22%" stopColor="rgba(255,255,255,0.2)" />
                  <stop offset="25%" stopColor="rgba(0,0,0,0.01)" />
                  <stop offset="30%" stopColor="rgba(0,0,0,0.05)" />
                  <stop offset="35%" stopColor="rgba(0,0,0,0.08)" />
                  <stop offset="50%" stopColor="rgba(0,0,0,0.1)" />
                  <stop offset="65%" stopColor="rgba(0,0,0,0.08)" />
                  <stop offset="70%" stopColor="rgba(0,0,0,0.05)" />
                  <stop offset="75%" stopColor="rgba(0,0,0,0.01)" />
                  <stop offset="78%" stopColor="rgba(255,255,255,0.2)" />
                  <stop offset="80%" stopColor="rgba(255,255,255,0.5)" />
                  <stop offset="82%" stopColor="rgba(255,255,255,0.8)" />
                  <stop offset="85%" stopColor="white" />
                  <stop offset="88%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </motion.linearGradient>
              </defs>
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
            
            {/* Title and Tagline on the right */}
            <div className="flex flex-col items-center">
              <motion.h1 
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 1, type: "spring" }}
                className="text-5xl md:text-7xl font-bold mb-3"
              >
                <span className="bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent bg-300% animate-gradient">
                  Starships.ai
                </span>
              </motion.h1>
              
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1, duration: 0.8 }}
                className="flex items-center gap-3 text-sm text-muted-foreground/60"
              >
                <div className="h-px w-12 bg-gradient-to-r from-transparent to-muted-foreground/30" />
                <span>Where vision meets intelligence</span>
                <div className="h-px w-12 bg-gradient-to-l from-transparent to-muted-foreground/30" />
              </motion.div>
            </div>
          </div>
          
          {/* Sibil AI Widget */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="w-full mb-8 mt-12"
          >
            {isAuthenticated ? (
              <LandingSibilWidgetAuthenticated 
                userName={(() => {
                  // Simply use the first word from displayName
                  if (user?.displayName) {
                    const firstName = user.displayName.trim().split(' ')[0];
                    return firstName;
                  }
                  
                  // Fallback to 'there'
                  return 'there';
                })()}
              />
            ) : (
              <LandingSibilWidgetStaticChat onVisionSubmit={handleVisionSubmit} />
            )}
          </motion.div>
          
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        >
          <div className="flex flex-col items-center space-y-1">
            {[0, 1, 2].map((index) => (
              <motion.div
                key={index}
                animate={{ 
                  opacity: [0.3, 1, 0.3],
                  scale: [0.8, 1, 0.8]
                }}
                transition={{
                  duration: 1.5,
                  delay: index * 0.2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <ChevronDown className="w-6 h-6 text-white/70" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.section>

      {/* System Flow Section */}
      <section className="py-20 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900/20 to-black" />
        {/* Subtle ambient glow */}
        <motion.div 
          className="absolute inset-0 opacity-10"
          style={{
            background: 'radial-gradient(circle at 30% 40%, rgba(var(--primary-rgb), 0.15) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(var(--primary-rgb), 0.1) 0%, transparent 50%)'
          }}
          animate={{
            opacity: [0.05, 0.15, 0.05]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ 
              duration: 0.8, 
              ease: [0.25, 0.1, 0.25, 1]
            }}
            viewport={{ once: false, margin: "-10%" }}
            className="text-center mb-36"
          >
            <motion.h2 
              className="text-4xl md:text-5xl font-bold mb-6"
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.9 }}
              transition={{ 
                duration: 0.7, 
                delay: 0.1,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              The Starship Journey
            </motion.h2>
            <motion.p 
              className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ 
                duration: 0.7, 
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              Your idea becomes a plan. Your plan becomes focused missions. Your missions become reality.
            </motion.p>
          </motion.div>

          <div className="space-y-16 relative">
            {/* You - Starting Point */}
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.1,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
              className="flex justify-center"
            >
              <div className="flex flex-col items-center space-y-4 max-w-md text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-white/20 to-white/10 rounded-full border border-white/30 backdrop-blur-sm flex items-center justify-center animate-pulse-glow will-change-transform">
                  <User className="w-8 h-8 text-white/80" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">You</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    You arrive with an idea, a vision of what could be. The journey begins here.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Connector: You → Vision Chamber */}
            <motion.div 
              className="flex justify-center relative"
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ 
                duration: 0.8, 
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <div className="flex flex-col items-center relative">
                <div className="w-px h-20 bg-gradient-to-b from-white/20 via-white/40 to-white/20 relative">
                  {[...Array(1)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-white/80 rounded-full left-1/2 transform -translate-x-1/2"
                      initial={{ top: 0, opacity: 0 }}
                      animate={{
                        top: ["0%", "100%"],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 2,
                        delay: i * 0.4,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  ))}
                  
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-transparent"
                    animate={{
                      opacity: [0, 0.7, 0],
                      scaleX: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.3,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <SystemCard
                icon={Brain}
                title="Vision Chamber"
                description="Transform your concept into something concrete. Not just documentation, but a living blueprint that evolves as you learn. Your idea, refined by intelligence that sees what you might miss."
                imageContent={
                  <div className="relative w-48 h-32 bg-gradient-to-br from-white/10 to-white/5 rounded-lg border border-white/20 backdrop-blur-sm flex items-center justify-center">
                    <div className="absolute inset-0 bg-grid-white/10 bg-[size:20px_20px] opacity-30" />
                    <div className="relative flex items-center space-x-4">
                      <motion.div
                        animate={{ 
                          scale: [0, 1.1, 1.1, 0],
                          rotate: [0, 180, 180, 360]
                        }}
                        transition={{ 
                          duration: 6, 
                          repeat: Infinity, 
                          ease: "easeInOut",
                          delay: 0,
                          times: [0, 0.05, 0.55, 0.65]
                        }}
                      >
                        <Sparkles className="w-7 h-7 text-white/50" />
                      </motion.div>
                      <motion.div
                        animate={{ 
                          opacity: [0.1, 0.1, 0.1, 1, 0.1, 1, 0.1, 1, 0.1, 1, 0.1, 1, 1, 1, 0.1, 1, 0.1, 1, 0.1]
                        }}
                        transition={{ 
                          duration: 9,
                          repeat: Infinity, 
                          ease: "linear",
                          delay: 3,
                          times: [0, 0.38, 0.39, 0.40, 0.41, 0.42, 0.43, 0.44, 0.45, 0.46, 0.47, 0.48, 0.70, 0.90, 0.91, 0.92, 0.93, 0.94, 1]
                        }}
                      >
                        <Lightbulb className="w-8 h-8 text-white/60" />
                      </motion.div>
                      <motion.div
                        animate={{ opacity: [0.2, 1, 0.2] }}
                        transition={{ 
                          duration: 6, 
                          repeat: Infinity, 
                          ease: "easeInOut"
                        }}
                        className="relative"
                      >
                        <Brain className="w-8 h-8 text-white/80" />
                      </motion.div>
                    </div>
                  </div>
                }
              />
            </motion.div>
            
            {/* Connector 1: Vision Chamber → Expeditions */}
            <motion.div 
              className="flex justify-center relative"
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ 
                duration: 0.8, 
                delay: 0.3,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <div className="flex flex-col items-center relative">
                {/* Main connection line */}
                <div className="w-px h-20 bg-gradient-to-b from-white/20 via-white/40 to-white/20 relative">
                  {/* Flowing particles */}
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-white/80 rounded-full left-1/2 transform -translate-x-1/2"
                      initial={{ top: 0, opacity: 0 }}
                      animate={{
                        top: ["0%", "100%"],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 2,
                        delay: i * 0.4,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  ))}
                  
                  {/* Energy pulse */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-transparent"
                    animate={{
                      opacity: [0, 0.7, 0],
                      scaleX: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.4,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <SystemCard
                icon={Compass}
                title="Expeditions"
                description="Your idea becomes reality through focused missions. Ship meaningful pieces quickly. Learn from real users. Build momentum that compounds."
                imageContent={
                  <div className="relative w-48 h-32 bg-gradient-to-br from-white/10 to-white/5 rounded-lg border border-white/20 backdrop-blur-sm overflow-hidden">
                    {/* Strategic Line Icons around rocket */}
                    {[
                      { x: "50px", y: "15px" },   // Top left
                      { x: "140px", y: "20px" },  // Top right
                      { x: "30px", y: "50px" },   // Mid left
                      { x: "160px", y: "55px" },  // Mid right
                      { x: "70px", y: "85px" },   // Bottom left
                      { x: "120px", y: "90px" }   // Bottom right
                    ].map((pos, i) => (
                      <motion.div
                        key={i}
                        className="absolute"
                        style={{
                          left: pos.x,
                          top: pos.y,
                        }}
                        animate={{ 
                          opacity: [0, 0.6, 0],
                          scale: [0.8, 1, 0.8],
                        }}
                        transition={{ 
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.4,
                          ease: "easeInOut"
                        }}
                      >
                        <Minus className="w-8 h-8 text-white/40 rotate-90" />
                      </motion.div>
                    ))}
                    
                    {/* Stationary Rocket in Center */}
                    <div className="absolute inset-0 flex items-center justify-center -mt-6">
                      {/* Rocket Icon - Vigorously Vibrating */}
                      <motion.div
                        animate={{ 
                          rotate: [-45, -44, -46, -44.5, -45.5, -44.8, -45.2, -45],
                          x: [0, 1, -0.8, 0.4, -1, 0.6, -0.4, 0.8, -0.2, 0],
                          y: [0, -0.6, 1, -0.4, 0.8, -1, 0.2, -0.8, 0.6, 0]
                        }}
                        transition={{ 
                          duration: 0.1,
                          repeat: Infinity,
                          ease: "linear"
                        }}
                      >
                        <Rocket className="w-8 h-8 text-white/60" />
                      </motion.div>
                    </div>

                    {/* Background Gradient Effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                  </div>
                }
              />
            </motion.div>
            
            {/* Connector 2: Expeditions → Crew */}
            <motion.div 
              className="flex justify-center relative"
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ 
                duration: 0.8, 
                delay: 0.5,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <div className="flex flex-col items-center relative">
                {/* Main connection line */}
                <div className="w-px h-20 bg-gradient-to-b from-white/20 via-white/40 to-white/20 relative">
                  {/* Flowing particles with different timing */}
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-white/80 rounded-full left-1/2 transform -translate-x-1/2"
                      initial={{ top: 0, opacity: 0 }}
                      animate={{
                        top: ["0%", "100%"],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 2.5,
                        delay: (i * 0.3) + 0.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  ))}
                  
                  {/* Energy pulse with different timing */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-transparent"
                    animate={{
                      opacity: [0, 0.7, 0],
                      scaleX: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 3.5,
                      delay: 0.7,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </div>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.6,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              <SystemCard
                icon={Users}
                title="Crew"
                description="The specialists your project needs, available when you need them. Development, design, strategy, growth. Not someday when you can afford them. Today."
                imageContent={
                  <div className="relative w-48 h-32 bg-gradient-to-br from-white/10 to-white/5 rounded-lg border border-white/20 backdrop-blur-sm flex items-center justify-center">
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
                          className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"
                        >
                          <div className="w-3 h-3 bg-white/40 rounded-full" />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                }
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Starship Classes Section */}
      <section className="py-48 px-4 relative">
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ 
              duration: 0.8, 
              ease: [0.25, 0.1, 0.25, 1]
            }}
            viewport={{ once: false, margin: "-10%" }}
            className="text-center mb-36"
          >
            <motion.h2 
              className="text-4xl md:text-5xl font-bold mb-6"
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.9 }}
              transition={{ 
                duration: 0.7, 
                delay: 0.1,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              Choose Your Starship Class
            </motion.h2>
            <motion.p 
              className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
              initial={{ opacity: 0, y: 20, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ 
                duration: 0.7, 
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
              Each class shapes your strategy and scale. Start small or go big—your Vision determines the path.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.1,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
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
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
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
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ 
                duration: 0.6, 
                delay: 0.3,
                ease: [0.25, 0.1, 0.25, 1]
              }}
              viewport={{ once: false, margin: "-10%" }}
            >
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
            </motion.div>
          </div>
        </div>
      </section>

      
      {/* Single overlay covering Ready to Launch and Footer sections */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent backdrop-blur-md z-0" style={{ height: '85vh' }} />
      
      {/* CTA Section */}
      <section className="py-72 px-4 relative">
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2 }}
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
      <footer className="py-16 px-4 relative z-10">
        {/* Gradient horizontal line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0 text-center md:text-left">
              <p className="text-muted-foreground mb-2">
                © 2025 Starships.ai - Where Vision meets Intelligence
              </p>
              <p className="text-muted-foreground text-sm">
                🪐 Manifested by <a href="https://theingenuity.co" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">The Ingenuity Co</a>
              </p>
            </div>
            <div className="flex space-x-6">
              <Button variant="ghost" size="sm">
                <Book className="w-4 h-4 mr-2" />
                Documentation
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.open('https://discord.gg/HjAXxpsV', '_blank')}
              >
                <Users className="w-4 h-4 mr-2" />
                Discord
              </Button>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </StarTheme>
  );
} 