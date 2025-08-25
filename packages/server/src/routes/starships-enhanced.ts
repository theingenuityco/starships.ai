import { Router } from 'express';
import type { Request, Response } from 'express';
import { 
  StarshipRepository, 
  VisionRepository,
  Vision
} from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import { 
  EnhancedValidationError as ValidationError,
} from '@starships/models';

const router: Router = Router();

// Repository dependency injection
let starshipRepo: StarshipRepository;
let visionRepo: VisionRepository;

export function initializeEnhancedStarshipRoutes(deps: {
  starshipRepository: StarshipRepository;
  visionRepository: VisionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  visionRepo = deps.visionRepository;
}

/**
 * Safely extract error message from unknown error
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

interface CreateStarshipWithVisionRequest {
  name: string;
  class: 'scout' | 'cruiser';
  vision?: {
    statement: string;
    confidence?: number;
    sibilSessionId?: string;
  };
}

// Enhanced POST /starships - Create new starship with optional vision
router.post('/starships/enhanced', authMiddleware, async (req: Request, res: Response) => {
  let createdStarship: any = null;
  let createdVision: Vision | null = null;
  
  try {
    const userId = req.user!.id;
    const { name, class: starshipClass, vision } = req.body as CreateStarshipWithVisionRequest;

    console.log('[STARSHIP-CREATE-ENHANCED] Starting enhanced starship creation for user:', userId);
    console.log('[STARSHIP-CREATE-ENHANCED] Has vision:', !!vision);

    // Validation
    if (!name || !starshipClass) {
      res.status(400).json({
        error: 'Missing required fields',
        details: 'Both name and class are required to create a starship',
        required_fields: ['name', 'class'],
        provided: { name: !!name, class: !!starshipClass },
      });
      return;
    }

    // Validate starship class
    if (!['scout', 'cruiser'].includes(starshipClass)) {
      res.status(400).json({
        error: 'Invalid starship class',
        details: 'Starship class must be either "scout" or "cruiser"',
        valid_classes: ['scout', 'cruiser'],
        provided: starshipClass,
      });
      return;
    }

    // Validate vision if provided
    if (vision) {
      if (!vision.statement || vision.statement.trim().length === 0) {
        res.status(400).json({
          error: 'Invalid vision',
          details: 'Vision statement cannot be empty',
        });
        return;
      }

      if (vision.statement.length < 20) {
        res.status(400).json({
          error: 'Vision too short',
          details: 'Vision statement must be at least 20 characters',
          provided_length: vision.statement.length,
          minimum_length: 20,
        });
        return;
      }

      if (vision.statement.length > 500) {
        res.status(400).json({
          error: 'Vision too long',
          details: 'Vision statement must be no more than 500 characters',
          provided_length: vision.statement.length,
          maximum_length: 500,
        });
        return;
      }
    }

    // Generate unique slug
    const slug = await starshipRepo.generateUniqueSlug(name, userId);

    // Check for duplicate name/slug
    const existingBySlug = await starshipRepo.findBySlug(slug, userId);
    if (existingBySlug) {
      res.status(409).json({
        error: 'Starship name already exists',
        details: 'A starship with this name or similar already exists. Please choose a different name.',
        suggestion: `${name} ${Date.now().toString().slice(-4)}`,
      });
      return;
    }

    console.log('[STARSHIP-CREATE-ENHANCED] Starting transaction for starship creation');

    try {
      // Create starship
      createdStarship = await starshipRepo.create({
        name,
        slug,
        class: starshipClass,
        status: 'active',
        ownerId: userId,
      });

      console.log('[STARSHIP-CREATE-ENHANCED] Starship created successfully:', createdStarship.id);

      // Create vision if provided
      if (vision) {
        console.log('[STARSHIP-CREATE-ENHANCED] Creating vision for starship:', createdStarship.id);
        
        createdVision = await visionRepo.create({
          starshipId: createdStarship.id,
          statement: vision.statement,
          confidence: vision.confidence || 0.8,
          refinementCount: 0,
          lastRefined: new Date().toISOString(),
          isActive: true
        });

        if (createdVision) {
          console.log('[STARSHIP-CREATE-ENHANCED] Vision created successfully:', createdVision.id);
        }
      }

      // Success response - match expected format
      const response: any = {
        starship: {
          id: createdStarship.id,
          name: createdStarship.name,
          slug: createdStarship.slug,
          class: createdStarship.class,
          status: createdStarship.status,
          ownerId: createdStarship.ownerId,
          maxAgents: createdStarship.maxAgents,
          createdAt: createdStarship.createdAt,
          updatedAt: createdStarship.updatedAt,
        }
      };

      // Include vision in response if created
      if (createdVision) {
        response.vision = {
          id: createdVision.id,
          statement: createdVision.statement,
          confidence: createdVision.confidence,
          refinementCount: createdVision.refinementCount,
          lastRefined: createdVision.lastRefined,
        };
      }

      console.log('[STARSHIP-CREATE-ENHANCED] Successfully created starship with vision');
      res.status(201).json(response);

    } catch (transactionError) {
      console.error('[STARSHIP-CREATE-ENHANCED] Transaction error:', transactionError);
      
      // Attempt rollback
      if (createdStarship) {
        console.log('[STARSHIP-CREATE-ENHANCED] Attempting to rollback starship creation');
        try {
          await starshipRepo.delete(createdStarship.id);
          console.log('[STARSHIP-CREATE-ENHANCED] Starship rollback successful');
        } catch (rollbackError) {
          console.error('[STARSHIP-CREATE-ENHANCED] Failed to rollback starship:', rollbackError);
        }
      }

      throw transactionError;
    }

  } catch (error) {
    console.error('[STARSHIP-CREATE-ENHANCED] Error creating starship with vision:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: getErrorMessage(error),
        field: (error as any).field,
        details: (error as any).details,
      });
    } else {
      res.status(500).json({
        error: 'Failed to create starship',
        details: getErrorMessage(error),
      });
    }
  }
});

// Transaction-safe update endpoint for existing starships to add vision
router.put('/starships/:id/vision', authMiddleware, async (req: Request, res: Response) => {
  try {
    const starshipId = req.params.id;
    const userId = req.user!.id;
    const { statement, confidence } = req.body;

    // Verify ownership
    const starship = await starshipRepo.findById(starshipId);
    if (!starship || starship.ownerId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Validate vision
    if (!statement || statement.trim().length === 0) {
      res.status(400).json({
        error: 'Invalid vision',
        details: 'Vision statement cannot be empty',
      });
      return;
    }

    if (statement.length < 20 || statement.length > 500) {
      res.status(400).json({
        error: 'Invalid vision length',
        details: 'Vision statement must be between 20 and 500 characters',
        provided_length: statement.length,
      });
      return;
    }

    // Check if vision already exists
    const existingVision = await visionRepo.findByStarship(starshipId);
    
    let vision: Vision | null;
    if (existingVision) {
      // Update existing vision
      vision = await visionRepo.update(existingVision.id, {
        statement,
        confidence: confidence || existingVision.confidence,
        refinementCount: existingVision.refinementCount + 1,
        lastRefined: new Date().toISOString(),
      });
    } else {
      // Create new vision
      vision = await visionRepo.create({
        starshipId,
        statement,
        confidence: confidence || 0.8,
        refinementCount: 0,
        lastRefined: new Date().toISOString(),
        isActive: true,
      });
    }

    if (!vision) {
      throw new Error('Failed to create or update vision');
    }

    res.json({
      vision: {
        id: vision.id,
        statement: vision.statement,
        confidence: vision.confidence,
        refinementCount: vision.refinementCount,
        lastRefined: vision.lastRefined,
      },
      starshipId,
    });

  } catch (error) {
    console.error('[VISION-UPDATE] Error updating vision:', error);
    res.status(500).json({
      error: 'Failed to update vision',
      details: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  }
});

export default router;