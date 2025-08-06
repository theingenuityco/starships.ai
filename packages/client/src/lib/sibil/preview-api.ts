import { VisionAnalysis } from '../onboarding/types';

// Fallback responses for when API fails
const FALLBACK_RESPONSES = {
  generic: "That's an interesting vision! Let's create your starship to make it reality.",
  saas: "Perfect for a Scout class starship! Let's get started.",
  platform: "This sounds like a Cruiser class mission! Let's begin.",
  marketplace: "A marketplace vision - ideal for a Cruiser class starship!",
  tool: "Building tools for developers - a Scout class would be perfect!",
  ai: "AI-powered innovation - let's launch your Cruiser class starship!"
};

// Detect vision type from keywords
function detectVisionType(vision: string): string {
  const lower = vision.toLowerCase();
  
  if (lower.includes('marketplace') || lower.includes('platform')) {
    return 'platform';
  }
  if (lower.includes('saas') || lower.includes('software')) {
    return 'saas';
  }
  if (lower.includes('tool') || lower.includes('developer')) {
    return 'tool';
  }
  if (lower.includes('ai') || lower.includes('learning') || lower.includes('intelligent')) {
    return 'ai';
  }
  if (lower.includes('marketplace') || lower.includes('sustainable')) {
    return 'marketplace';
  }
  
  return 'generic';
}

// Generate a suggested name based on vision
function generateSuggestedName(vision: string): string {
  const words = vision.toLowerCase().split(/\s+/);
  const keywords = words.filter(w => w.length > 4 && !['build', 'create', 'make', 'want'].includes(w));
  
  if (keywords.length > 0) {
    // Take first two meaningful words and capitalize
    const name = keywords.slice(0, 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return name + ' Starship';
  }
  
  return 'Vision Starship';
}

// Extract keywords from vision
function extractKeywords(vision: string): string[] {
  const stopWords = ['i', 'want', 'to', 'build', 'create', 'make', 'the', 'a', 'an', 'for', 'that', 'with'];
  const words = vision.toLowerCase().split(/\s+/);
  
  return words
    .filter(w => w.length > 3 && !stopWords.includes(w))
    .slice(0, 5);
}

// Analyze vision and return analysis
export async function analyzeVisionPreAuth(vision: string): Promise<{
  analysis: VisionAnalysis;
  sessionId: string;
  suggestions: string[];
}> {
  const sessionId = `preview_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  
  try {
    // Call the preview API endpoint
    const response = await fetch('/api/sibil/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vision,
        sessionId
      }),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      analysis: data.analysis,
      sessionId: data.sessionId || sessionId,
      suggestions: data.suggestions || []
    };
    
  } catch (error) {
    console.warn('Preview API failed, using fallback:', error);
    
    // Use fallback response
    const visionType = detectVisionType(vision);
    const suggestedName = generateSuggestedName(vision);
    const keywords = extractKeywords(vision);
    
    // Determine recommended class based on vision complexity
    const wordCount = vision.split(/\s+/).length;
    const recommendedClass = wordCount > 15 || vision.includes('platform') || vision.includes('marketplace') 
      ? 'cruiser' 
      : 'scout';
    
    return {
      analysis: {
        summary: FALLBACK_RESPONSES[visionType as keyof typeof FALLBACK_RESPONSES] || FALLBACK_RESPONSES.generic,
        suggestedName,
        recommendedClass: recommendedClass as 'scout' | 'cruiser',
        confidence: 0.7,
        keywords
      },
      sessionId,
      suggestions: [
        "Consider starting with a core MVP feature",
        "Focus on solving one problem really well",
        "Think about your target users and their needs"
      ]
    };
  }
}

// Cache successful responses to reduce API calls
const responseCache = new Map<string, any>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function analyzeVisionWithCache(vision: string): Promise<any> {
  const cacheKey = vision.toLowerCase().trim();
  const cached = responseCache.get(cacheKey);
  
  if (cached && cached.timestamp > Date.now() - CACHE_TTL) {
    return cached.data;
  }
  
  const result = await analyzeVisionPreAuth(vision);
  
  responseCache.set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });
  
  // Clean old cache entries
  if (responseCache.size > 100) {
    const entries = Array.from(responseCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    entries.slice(0, 50).forEach(([key]) => responseCache.delete(key));
  }
  
  return result;
}