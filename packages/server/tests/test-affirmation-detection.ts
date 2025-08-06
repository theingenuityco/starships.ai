#!/usr/bin/env tsx

import { AffirmationDetector } from '../src/services/AffirmationDetector';

// Test phrases to verify detection
const testPhrases = [
  { phrase: "Looks good for now", expected: "accept" },
  { phrase: "looks good for now", expected: "accept" },
  { phrase: "Sounds good for now", expected: "accept" },
  { phrase: "looks great for now", expected: "accept" },
  { phrase: "sounds perfect for now", expected: "accept" },
  { phrase: "looks fine for now", expected: "accept" },
  { phrase: "Yes", expected: "accept" },
  { phrase: "yes, that sounds great", expected: "accept" },
  { phrase: "No, that's not right", expected: "reject" },
  { phrase: "Can you make it more specific?", expected: "modify" },
  { phrase: "what is my vision?", expected: "unclear" },
  { phrase: "show me my vision", expected: "unclear" }
];

const detector = new AffirmationDetector();

console.log("Testing Affirmation Detection Patterns:\n");
console.log("=" .repeat(50));

for (const test of testPhrases) {
  const result = detector.analyzeResponse(test.phrase);
  const passed = result.intent === test.expected;
  
  console.log(`\nPhrase: "${test.phrase}"`);
  console.log(`Expected: ${test.expected}`);
  console.log(`Detected: ${result.intent}`);
  console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (result.intent === 'accept') {
    console.log(`  - isAffirmative: ${result.isAffirmative}`);
    console.log(`  - confidence: ${result.confidence}`);
  }
  
  if (!passed) {
    console.log(`  - isAffirmative: ${result.isAffirmative}`);
    console.log(`  - isNegative: ${result.isNegative}`);
    console.log(`  - isRequestingChanges: ${result.isRequestingChanges}`);
    console.log(`  - confidence: ${result.confidence}`);
  }
}

console.log("\n" + "=" .repeat(50));
console.log("\nSpecific Test: 'Looks good for now'");
console.log("-" .repeat(30));

const specificTest = "Looks good for now";
const isAffirmative = detector.isAffirmative(specificTest);
const analysis = detector.analyzeResponse(specificTest);

console.log(`Input: "${specificTest}"`);
console.log(`isAffirmative(): ${isAffirmative}`);
console.log(`Full Analysis:`);
console.log(JSON.stringify(analysis, null, 2));

// Test the regex pattern directly
const pattern = /^(looks|sounds) (good|great|perfect|right|fine)( for now)?$/i;
const directMatch = pattern.test(specificTest);
console.log(`\nDirect Pattern Match: ${directMatch}`);

console.log("\n✅ Test complete!");