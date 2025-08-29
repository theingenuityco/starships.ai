import { RepositoryFactory } from "@starships/models";

/**
 * Load vision context for an agent's starship
 * Extracted from chat.ts to improve separation of concerns
 */
export async function loadVisionContext(
  agentId: string, 
  userId: string,
  agent: any
): Promise<string> {
  console.log('🔍 [VISION] Starting enhanced vision context loading...');
  console.log('👤 [VISION] Original Kinde user ID:', userId);
  
  const starshipRepo = RepositoryFactory.getStarshipRepository();
  const visionRepo = RepositoryFactory.getVisionRepository();
  const userRepo = RepositoryFactory.getUserRepository();
  
  // Step 1: Attempt to resolve internal user ID from Kinde user ID
  let internalUserId = userId;
  
  try {
    console.log('🔍 [VISION] Attempting to resolve internal user from Kinde ID...');
    const user = await userRepo.findByKindeId(userId);
    if (user) {
      internalUserId = user.id;
      console.log('✅ [VISION] Internal user found successfully:', {
        internalUserId: internalUserId,
        username: user.username,
        email: user.email,
        kindeId: user.kindeId
      });
    } else {
      console.warn('⚠️ [VISION] No internal user found for Kinde ID');
      console.log('🔄 [VISION] Will attempt starship lookup with Kinde ID as fallback');
    }
  } catch (userError) {
    console.error('❌ [VISION] Error during user ID resolution:', {
      error: (userError as Error).message,
      stack: (userError as Error).stack
    });
    console.log('🔄 [VISION] Will attempt starship lookup with Kinde ID as fallback');
  }
  
  let visionContext = "";
  
  // Step 2: Load the agent's assigned starship for proper isolation
  try {
    console.log('🚢 [VISION] Loading agent\'s assigned starship...');
    
    // CRITICAL FIX: Use the agent's starshipId to ensure proper isolation
    if (!agent.starshipId) {
      console.error('❌ [VISION] Agent has no starshipId assigned:', agent.id);
      throw new Error(`Agent ${agent.id} has no starship assigned`);
    }
    
    console.log('🔍 [VISION] Fetching starship with ID:', agent.starshipId);
    const activeStarship = await starshipRepo.findById(agent.starshipId);
    
    if (!activeStarship) {
      console.error('❌ [VISION] Starship not found for agent:', {
        agentId: agent.id,
        starshipId: agent.starshipId
      });
      throw new Error(`Starship ${agent.starshipId} not found for agent ${agent.id}`);
    }
    
    console.log('✅ [VISION] Agent\'s starship loaded:', {
      starshipId: activeStarship.id,
      starshipName: activeStarship.name,
      starshipClass: activeStarship.class,
      starshipStatus: activeStarship.status,
      ownerId: activeStarship.ownerId
    });
    
    // Verify the starship belongs to the user for security
    const isOwnerMatch = activeStarship.ownerId === internalUserId || 
                        activeStarship.ownerId === userId;
    
    // For temporary users, skip ownership check but log a warning
    const isTemporaryUser = userId.startsWith('temp:');
    
    if (!isOwnerMatch && !isTemporaryUser) {
      console.error('❌ [VISION] Starship ownership mismatch:', {
        starshipOwnerId: activeStarship.ownerId,
        internalUserId: internalUserId,
        kindeUserId: userId
      });
      throw new Error('Agent\'s starship does not belong to the requesting user');
    } else if (!isOwnerMatch && isTemporaryUser) {
      console.warn('⚠️ [VISION] Skipping ownership check for temporary user:', {
        starshipOwnerId: activeStarship.ownerId,
        tempUserId: userId,
        reason: 'Temporary user IDs cannot be resolved to internal IDs'
      });
    }
    
    if (activeStarship) {
      console.log('🎯 [VISION] Active starship selected:', {
        id: activeStarship.id,
        name: activeStarship.name,
        class: activeStarship.class,
        ownerId: activeStarship.ownerId,
        status: activeStarship.status,
        selectionReason: activeStarship.status === 'active' ? 'first-active' : 'first-available'
      });
      
      // Step 3: Enhanced vision loading with validation
      console.log('🔍 [VISION] Querying vision for starship ID:', activeStarship.id);
      const vision = await visionRepo.findByStarship(activeStarship.id);
      
      console.log('👁️ [VISION] Vision database lookup result:', {
        visionFound: !!vision,
        visionId: vision?.id,
        starshipId: vision?.starshipId,
        hasStatement: !!vision?.statement,
        statementLength: vision?.statement?.length || 0,
        statementValue: vision?.statement || 'NULL/UNDEFINED',
        statementPreview: vision?.statement ? vision.statement.substring(0, 100) : 'NO_STATEMENT',
        refinementCount: vision?.refinementCount || 0,
        lastRefined: vision?.lastRefined,
        createdAt: vision?.createdAt
      });
      
      if (vision?.statement && vision.statement.trim().length > 0) {
        console.log('📖 [VISION] Vision loaded successfully from database:', {
          length: vision.statement.length,
          preview: vision.statement.substring(0, 150) + '...',
          refinementCount: vision.refinementCount || 0,
          lastRefined: vision.lastRefined
        });
        
        visionContext = `\n\nCOMPANY/STARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: This is YOUR company's vision. ALL work must align with this vision.\n\n⚠️ STRICT VISION ALIGNMENT POLICY:\n- You can ONLY work on missions that align with this vision\n- If a mission doesn't align with the vision, you MUST NOT proceed\n- Always check: "Does this mission support our vision of ${vision.statement}?"\n- If NO: Inform the user they have two options:\n  1. Adjust the mission to align with the current vision\n  2. Visit the Vision Chamber to update the company vision for strategic pivots\n- If YES: Proceed with enthusiasm while keeping the vision in mind\n\n💡 Remember: The Vision Chamber exists for strategic evolution. If the company is pivoting to new markets or products, the vision should be updated there first.\n`;
        console.log('✅ [VISION] Vision context prepared successfully, length:', visionContext.length);
      } else {
        console.log('📝 [VISION] Vision exists but has no usable statement');
        if (vision) {
          console.log('🔍 [VISION] Vision investigation details:', {
            id: vision.id,
            starshipId: vision.starshipId,
            statement: vision.statement,
            statementType: typeof vision.statement,
            statementTrimmed: vision.statement?.trim(),
            refinementCount: vision.refinementCount
          });
        }
        console.log('⚠️ [VISION] Proceeding without vision context - empty/null statement for starship:', activeStarship.id);
      }
    } else {
      console.error('❌ [VISION] CRITICAL: Agent\'s starship could not be loaded');
      console.error('🔍 [VISION] Debug information:', {
        agentId: agent.id,
        starshipId: agent.starshipId,
        originalKindeId: userId,
        resolvedInternalId: internalUserId
      });
      
      console.log('⚠️ [VISION] Proceeding without vision context - starship not accessible');
    }
  } catch (error) {
    console.error('❌ [VISION] Vision loading failed with critical error:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name,
      originalKindeId: userId,
      resolvedInternalId: internalUserId
    });
    // Don't block agent - continue without vision context
    console.log('🔄 [VISION] Continuing without vision context due to critical error');
  }

  return visionContext;
}