import { Router } from 'express';
import type { Request, Response } from 'express';
import { VisionRepository } from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import type { StarshipRepository } from '@starships/models';
import rateLimit from 'express-rate-limit';
import { VisionMetricsCalculator } from '../services/VisionMetricsCalculator';
import { VisionRefinementService } from '../services/VisionRefinementService';

const router: Router = Router();

// Repository dependency injection (following starships.ts pattern)
let starshipRepo: StarshipRepository;
let visionRepo: VisionRepository;
let visionMetricsCalculator: VisionMetricsCalculator | null = null;
let visionRefinementService: VisionRefinementService | null = null;

export function initializeVisionRoutes(deps: {
  starshipRepository: StarshipRepository;
  visionRepository: VisionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  visionRepo = deps.visionRepository;
  // Delay initialization of services that depend on RepositoryFactory
}

// Lazy getters for services
function getVisionMetricsCalculator(): VisionMetricsCalculator {
  if (!visionMetricsCalculator) {
    visionMetricsCalculator = new VisionMetricsCalculator();
  }
  return visionMetricsCalculator;
}

function getVisionRefinementService(): VisionRefinementService {
  if (!visionRefinementService) {
    visionRefinementService = new VisionRefinementService();
  }
  return visionRefinementService;
}

// Rate limiting configurations
const generalVisionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for general vision operations
  message: { error: 'Too many vision requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const visionAnalysisRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 analysis requests per windowMs (more expensive operations)
  message: { error: 'Too many vision analysis requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/starships/:id/vision
router.get('/starships/:id/vision', authMiddleware, generalVisionRateLimit, async (req, res) => {
  try {
    const starshipId = req.params.id;
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Get vision from database, create empty if doesn't exist
    let vision = await visionRepo.findByStarship(starshipId);
    if (!vision) {
      vision = await visionRepo.create({
        starshipId,
        statement: '',
        confidence: 0.5,
        refinementCount: 0,
        lastRefined: new Date().toISOString(),
        isActive: true
      });
    }
    
    // Include metrics in response
    res.json({ 
      vision: vision.statement,
      metrics: {
        clarityScore: vision.clarityScore || null,
        specificityScore: vision.specificityScore || null,
        actionabilityScore: vision.actionabilityScore || null,
        inspirationalScore: vision.inspirationalScore || null,
        overallQuality: vision.overallQuality || null,
        hasObjectives: vision.hasObjectives || null,
        hasTimeframe: vision.hasTimeframe || null,
        hasMeasurables: vision.hasMeasurables || null
      },
      confidence: vision.confidence,
      refinementCount: vision.refinementCount,
      lastRefined: vision.lastRefined
    });
  } catch (error) {
    console.error('Error getting vision:', error);
    res.status(500).json({ error: 'Failed to read vision' });
  }
});

// POST /api/starships/:id/vision
router.post('/starships/:id/vision', authMiddleware, generalVisionRateLimit, async (req, res) => {
  try {
    const starshipId = req.params.id;
    const { vision } = req.body;
    
    if (!vision || typeof vision !== 'string' || vision.trim().length === 0) {
      res.status(400).json({ error: 'Vision statement is required' });
      return;
    }
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Calculate metrics for the new vision
    let metrics = null;
    try {
      const calculatedMetrics = await getVisionMetricsCalculator().calculateMetrics(vision.trim());
      metrics = {
        clarityScore: calculatedMetrics.clarityScore,
        specificityScore: calculatedMetrics.specificityScore,
        actionabilityScore: calculatedMetrics.actionabilityScore,
        inspirationalScore: calculatedMetrics.inspirationalScore,
        overallQuality: calculatedMetrics.overallQuality,
        hasObjectives: calculatedMetrics.hasObjectives,
        hasTimeframe: calculatedMetrics.hasTimeframe,
        hasMeasurables: calculatedMetrics.hasMeasurables
      };
    } catch (error) {
      console.warn('Failed to calculate vision metrics:', error);
    }
    
    // Update existing vision or create new one
    let existingVision = await visionRepo.findByStarship(starshipId);
    if (existingVision) {
      await visionRepo.updateStatement(starshipId, vision);
      // Update metrics if calculated successfully
      if (metrics) {
        await visionRepo.updateMetrics(starshipId, metrics);
      }
    } else {
      const newVision = await visionRepo.create({
        starshipId,
        statement: vision,
        confidence: 0.5,
        refinementCount: 1,
        lastRefined: new Date().toISOString(),
        isActive: true
      });
      // Update metrics if calculated successfully
      if (metrics) {
        await visionRepo.updateMetrics(starshipId, metrics);
      }
    }
    
    res.json({ 
      success: true,
      metrics: metrics || undefined
    });
  } catch (error) {
    console.error('Error saving vision:', error);
    res.status(500).json({ error: 'Failed to save vision' });
  }
});

// GET /api/vision/:starshipId/metrics - Get current vision metrics
router.get('/vision/:starshipId/metrics', authMiddleware, generalVisionRateLimit, async (req, res) => {
  try {
    const starshipId = req.params.starshipId;
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Get metrics from database
    const metrics = await visionRepo.getMetrics(starshipId);
    
    if (!metrics) {
      res.status(404).json({ error: 'Vision not found' });
      return;
    }
    
    res.json({ 
      starshipId,
      metrics: {
        clarityScore: metrics.clarityScore,
        specificityScore: metrics.specificityScore,
        actionabilityScore: metrics.actionabilityScore,
        inspirationalScore: metrics.inspirationalScore,
        overallQuality: metrics.overallQuality,
        hasObjectives: metrics.hasObjectives,
        hasTimeframe: metrics.hasTimeframe,
        hasMeasurables: metrics.hasMeasurables
      }
    });
  } catch (error) {
    console.error('Error getting vision metrics:', error);
    res.status(500).json({ error: 'Failed to get vision metrics' });
  }
});

// POST /api/vision/analyze - Analyze vision and get improvement suggestions
router.post('/vision/analyze', authMiddleware, visionAnalysisRateLimit, async (req, res) => {
  try {
    const { vision, starshipId } = req.body;
    
    if (!vision || typeof vision !== 'string' || vision.trim().length === 0) {
      res.status(400).json({ error: 'Vision statement is required' });
      return;
    }
    
    if (!starshipId) {
      res.status(400).json({ error: 'Starship ID is required' });
      return;
    }
    
    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    try {
      // Get analysis from the VisionRefinementService
      const analysis = await getVisionRefinementService().analyze(vision.trim());
      
      // Get improvement areas analysis
      const calculatedMetrics = await getVisionMetricsCalculator().calculateMetrics(vision.trim());
      const improvementAnalysis = getVisionMetricsCalculator().analyzeImprovementAreas(calculatedMetrics);
      
      res.json({
        starshipId,
        vision,
        analysis: {
          clarityScore: analysis.clarityScore,
          specificityScore: analysis.specificityScore,
          actionabilityScore: analysis.actionabilityScore,
          inspirationalScore: analysis.inspirationalScore,
          overallConfidence: analysis.overallConfidence,
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          suggestions: analysis.suggestions
        },
        improvementAreas: {
          recommendations: improvementAnalysis.recommendations,
          priorityArea: improvementAnalysis.priorityArea,
          completenessGaps: improvementAnalysis.completenessGaps
        },
        metrics: {
          clarityScore: calculatedMetrics.clarityScore,
          specificityScore: calculatedMetrics.specificityScore,
          actionabilityScore: calculatedMetrics.actionabilityScore,
          inspirationalScore: calculatedMetrics.inspirationalScore,
          overallQuality: calculatedMetrics.overallQuality,
          hasObjectives: calculatedMetrics.hasObjectives,
          hasTimeframe: calculatedMetrics.hasTimeframe,
          hasMeasurables: calculatedMetrics.hasMeasurables,
          confidence: calculatedMetrics.confidence
        }
      });
    } catch (analysisError) {
      console.error('Vision analysis error:', analysisError);
      
      // Fallback to basic metrics calculation
      try {
        const metrics = await getVisionMetricsCalculator().calculateMetrics(vision.trim());
        const improvementAnalysis = getVisionMetricsCalculator().analyzeImprovementAreas(metrics);
        
        res.json({
          starshipId,
          vision,
          analysis: {
            clarityScore: metrics.clarityScore,
            specificityScore: metrics.specificityScore,
            actionabilityScore: metrics.actionabilityScore,
            inspirationalScore: metrics.inspirationalScore,
            overallConfidence: metrics.confidence,
            strengths: ['Vision statement is present'],
            weaknesses: ['Analysis service temporarily unavailable'],
            suggestions: improvementAnalysis.recommendations
          },
          improvementAreas: {
            recommendations: improvementAnalysis.recommendations,
            priorityArea: improvementAnalysis.priorityArea,
            completenessGaps: improvementAnalysis.completenessGaps
          },
          metrics: {
            clarityScore: metrics.clarityScore,
            specificityScore: metrics.specificityScore,
            actionabilityScore: metrics.actionabilityScore,
            inspirationalScore: metrics.inspirationalScore,
            overallQuality: metrics.overallQuality,
            hasObjectives: metrics.hasObjectives,
            hasTimeframe: metrics.hasTimeframe,
            hasMeasurables: metrics.hasMeasurables,
            confidence: metrics.confidence
          },
          note: 'Using fallback analysis due to service unavailability'
        });
      } catch (metricsError) {
        console.error('Metrics calculation also failed:', metricsError);
        res.status(500).json({ error: 'Failed to analyze vision - both primary and fallback analysis failed' });
      }
    }
    
  } catch (error) {
    console.error('Error analyzing vision:', error);
    res.status(500).json({ error: 'Failed to analyze vision' });
  }
});

export default router;