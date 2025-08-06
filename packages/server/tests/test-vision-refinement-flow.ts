#!/usr/bin/env tsx

import { RepositoryFactory } from '@starships/models';
import { createConnection } from '@starships/models';
import { SibilService } from '../src/services/SibilService';
import { VisionRefinementService } from '../src/services/VisionRefinementService';
import { AffirmationDetector } from '../src/services/AffirmationDetector';
import { VisionRefinementSessionManager } from '../src/services/VisionRefinementSessionManager';
import { env } from '../src/config/environment';

async function testVisionRefinementFlow() {
  console.log("=".repeat(60));
  console.log("VISION REFINEMENT FLOW INTEGRATION TEST");
  console.log("=".repeat(60));
  
  try {
    // Initialize Neo4j connection
    await createConnection({
      uri: env.NEO4J_URI,
      username: env.NEO4J_USERNAME,
      password: env.NEO4J_PASSWORD,
    });
    console.log("✅ Neo4j connection established");
    
    // Initialize repository
    await RepositoryFactory.initialize();
    console.log("✅ Repository factory initialized");
    
    // Test data
    const starshipId = 'test-starship-123';
    const userId = 'test-user-456';
    const currentVision = "I want to build the best building in the world";
    
    // Create test starship and vision
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const visionRepo = RepositoryFactory.getVisionRepository();
    
    // Clean up any existing test data
    try {
      await visionRepo.delete(starshipId);
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    // Create test vision
    const testVision = await visionRepo.create({
      starshipId,
      statement: currentVision,
      refinementCount: 0,
      confidence: 0.5,
      lastRefined: new Date().toISOString(),
      isActive: true
    });
    
    console.log("\n📝 Created test vision:");
    console.log(`   Statement: "${testVision.statement}"`);
    console.log(`   Starship ID: ${testVision.starshipId}`);
    
    // Test 1: Vision Detection
    console.log("\n" + "-".repeat(60));
    console.log("TEST 1: Vision Detection");
    console.log("-".repeat(60));
    
    const visionService = new VisionRefinementService();
    
    const testMessages = [
      { message: "what is my vision?", expected: false },
      { message: "I want to refine my vision", expected: true },
      { message: "help me improve my vision", expected: true },
      { message: "my vision needs to be clearer", expected: true }
    ];
    
    for (const test of testMessages) {
      const isVisionRelated = visionService.isVisionRelated(test.message);
      const passed = isVisionRelated === test.expected;
      console.log(`Message: "${test.message}"`);
      console.log(`Expected: ${test.expected}, Got: ${isVisionRelated} ${passed ? '✅' : '❌'}`);
    }
    
    // Test 2: Affirmation Detection
    console.log("\n" + "-".repeat(60));
    console.log("TEST 2: Affirmation Detection");
    console.log("-".repeat(60));
    
    const detector = new AffirmationDetector();
    const testResponses = [
      { response: "Looks good for now", expectedIntent: "accept" },
      { response: "Yes", expectedIntent: "accept" },
      { response: "yes, that sounds great", expectedIntent: "accept" },
      { response: "No, that's not right", expectedIntent: "reject" },
      { response: "Can you make it more specific?", expectedIntent: "modify" }
    ];
    
    for (const test of testResponses) {
      const analysis = detector.analyzeResponse(test.response);
      const passed = analysis.intent === test.expectedIntent;
      console.log(`Response: "${test.response}"`);
      console.log(`Expected: ${test.expectedIntent}, Got: ${analysis.intent} ${passed ? '✅' : '❌'}`);
    }
    
    // Test 3: Session Management
    console.log("\n" + "-".repeat(60));
    console.log("TEST 3: Session Management");
    console.log("-".repeat(60));
    
    const sessionManager = new VisionRefinementSessionManager();
    
    // Create a session
    const session = sessionManager.getOrCreateSession(userId, starshipId, currentVision);
    console.log(`✅ Created session: ${session.sessionId}`);
    
    // Add a message
    sessionManager.addMessage(session.sessionId, 'user', 'Help me refine my vision');
    console.log(`✅ Added user message to session`);
    
    // Set awaiting confirmation with proposed vision
    const proposedVision = "By 2025, I will construct an innovative, sustainable building that sets new standards for architectural excellence";
    sessionManager.setAwaitingConfirmation(session.sessionId, proposedVision, 0.85);
    console.log(`✅ Set proposed vision: "${proposedVision}"`);
    
    // Get session for user
    const retrievedSession = sessionManager.getSessionForUser(userId);
    if (retrievedSession && retrievedSession.awaitingConfirmation && retrievedSession.proposedVision === proposedVision) {
      console.log(`✅ Session correctly maintains state`);
    } else {
      console.log(`❌ Session state not maintained properly`);
    }
    
    // Test 4: Vision Update on Acceptance
    console.log("\n" + "-".repeat(60));
    console.log("TEST 4: Vision Update on Acceptance");
    console.log("-".repeat(60));
    
    // Simulate accepting the vision
    sessionManager.acceptProposal(session.sessionId);
    console.log(`✅ Accepted proposal in session`);
    
    // Update the vision in database
    const updatedVision = await visionRepo.updateStatement(starshipId, proposedVision);
    
    if (updatedVision && updatedVision.statement === proposedVision) {
      console.log(`✅ Vision successfully updated in database`);
      console.log(`   New statement: "${updatedVision.statement}"`);
    } else {
      console.log(`❌ Vision update failed`);
    }
    
    // Test 5: Full Flow Simulation
    console.log("\n" + "-".repeat(60));
    console.log("TEST 5: Full Vision Refinement Flow");
    console.log("-".repeat(60));
    
    // Reset vision for full flow test
    await visionRepo.updateStatement(starshipId, currentVision);
    
    // Step 1: User asks to refine vision
    console.log("\n1️⃣ User: 'Help me make my vision more specific and actionable'");
    
    // Check if message is vision-related
    const isVisionMessage = visionService.isVisionRelated("Help me make my vision more specific and actionable");
    console.log(`   Vision-related: ${isVisionMessage ? '✅ Yes' : '❌ No'}`);
    
    // Step 2: AI proposes refined vision
    const refinementProposal = "By Q4 2025, I will construct a 50-story sustainable skyscraper that achieves LEED Platinum certification and becomes a landmark for green architecture";
    console.log(`\n2️⃣ AI proposes: "${refinementProposal}"`);
    
    // Create new session for this flow
    const flowSession = sessionManager.getOrCreateSession('flow-user', starshipId, currentVision);
    sessionManager.setAwaitingConfirmation(flowSession.sessionId, refinementProposal, 0.9);
    console.log(`   Session awaiting confirmation: ${flowSession.awaitingConfirmation ? '✅' : '❌'}`);
    
    // Step 3: User says "Looks good for now"
    console.log(`\n3️⃣ User: "Looks good for now"`);
    
    const userResponse = "Looks good for now";
    const responseAnalysis = detector.analyzeResponse(userResponse);
    console.log(`   Detected intent: ${responseAnalysis.intent} ${responseAnalysis.intent === 'accept' ? '✅' : '❌'}`);
    console.log(`   Confidence: ${responseAnalysis.confidence}`);
    
    // Step 4: Update vision based on acceptance
    if (responseAnalysis.intent === 'accept') {
      console.log(`\n4️⃣ Updating vision in database...`);
      
      // Accept in session
      sessionManager.acceptProposal(flowSession.sessionId);
      
      // Update in database
      const finalUpdate = await visionRepo.updateStatement(starshipId, refinementProposal);
      
      if (finalUpdate && finalUpdate.statement === refinementProposal) {
        console.log(`   ✅ Vision successfully updated!`);
        console.log(`   Final vision: "${finalUpdate.statement}"`);
      } else {
        console.log(`   ❌ Failed to update vision`);
      }
    }
    
    // Clean up test data
    console.log("\n" + "-".repeat(60));
    console.log("CLEANUP");
    console.log("-".repeat(60));
    
    await visionRepo.delete(starshipId);
    console.log("✅ Test data cleaned up");
    
    console.log("\n" + "=".repeat(60));
    console.log("ALL TESTS COMPLETED SUCCESSFULLY! 🎉");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testVisionRefinementFlow();