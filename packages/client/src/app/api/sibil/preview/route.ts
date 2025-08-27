import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Simple in-memory rate limiting (will reset on server restart)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(identifier) || [];
  
  // Filter out old requests outside the window
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_PER_MINUTE) {
    return false; // Rate limit exceeded
  }
  
  // Add current request
  recentRequests.push(now);
  rateLimitMap.set(identifier, recentRequests);
  
  // Clean up old entries periodically
  if (rateLimitMap.size > 1000) {
    const entries = Array.from(rateLimitMap.entries());
    entries.forEach(([key, times]) => {
      const recent = times.filter(time => now - time < RATE_LIMIT_WINDOW);
      if (recent.length === 0) {
        rateLimitMap.delete(key);
      } else {
        rateLimitMap.set(key, recent);
      }
    });
  }
  
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before trying again.' },
        { status: 429 }
      );
    }
    
    const { vision, sessionId } = await request.json();
    
    // Validate input
    if (!vision || typeof vision !== 'string') {
      return NextResponse.json(
        { error: 'Vision is required' },
        { status: 400 }
      );
    }
    
    if (vision.length < 20 || vision.length > 500) {
      return NextResponse.json(
        { error: 'Vision must be between 20 and 500 characters' },
        { status: 400 }
      );
    }
    
    // Use OpenAI API if configured, otherwise use fallback
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      // Return a structured fallback response
      return NextResponse.json({
        analysis: {
          summary: "That's an exciting vision! Let's turn your idea into reality by creating your starship.",
          suggestedName: generateFallbackName(vision),
          recommendedClass: determineClass(vision),
          confidence: 0.7,
          keywords: extractKeywords(vision)
        },
        sessionId: sessionId || `preview_${Date.now()}`,
        suggestions: [
          "Start with a clear MVP to validate your idea",
          "Focus on your core value proposition",
          "Identify your target users early"
        ]
      });
    }
    
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey
    });
    
    // Use GPT-3.5-turbo for cost optimization
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are Sibil AI, a helpful assistant that analyzes business visions and provides guidance. 
          Analyze the user's vision and provide:
          1. A brief, encouraging summary (max 100 chars)
          2. A suggested starship name based on their vision
          3. Always recommend 'cruiser' class (never 'scout')
          4. Extract 3-5 keywords
          5. Confidence score (0-1)
          
          Respond in JSON format:
          {
            "summary": "string",
            "suggestedName": "string",
            "recommendedClass": "scout" | "cruiser",
            "keywords": ["string"],
            "confidence": number
          }`
        },
        {
          role: 'user',
          content: `Analyze this vision: "${vision}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });
    
    const aiResponse = JSON.parse(completion.choices[0].message.content || '{}');
    
    return NextResponse.json({
      analysis: {
        summary: aiResponse.summary || "Great vision! Let's build your starship together.",
        suggestedName: aiResponse.suggestedName || generateFallbackName(vision),
        recommendedClass: 'cruiser', // Always recommend cruiser, never scout
        confidence: aiResponse.confidence || 0.8,
        keywords: aiResponse.keywords || extractKeywords(vision)
      },
      sessionId: sessionId || `preview_${Date.now()}`,
      suggestions: [
        "Your vision has strong potential",
        "Consider starting with a focused MVP",
        "We'll help you refine this further"
      ]
    });
    
  } catch (error) {
    console.error('Preview API error:', error);
    
    // Return graceful fallback on error
    return NextResponse.json({
      analysis: {
        summary: "Interesting vision! Let's explore this together.",
        suggestedName: "Vision Starship",
        recommendedClass: "cruiser", // Always recommend cruiser
        confidence: 0.6,
        keywords: ["innovation", "growth", "impact"]
      },
      sessionId: `preview_${Date.now()}`,
      suggestions: ["Let's refine your vision together"]
    });
  }
}

// Helper functions for fallback responses
function generateFallbackName(vision: string): string {
  const words = vision.toLowerCase().split(/\s+/);
  const meaningful = words.filter(w => 
    w.length > 4 && 
    !['want', 'build', 'create', 'make', 'that', 'with'].includes(w)
  );
  
  if (meaningful.length > 0) {
    return meaningful[0].charAt(0).toUpperCase() + meaningful[0].slice(1) + ' Starship';
  }
  
  return 'Vision Starship';
}

function determineClass(_vision: string): 'scout' | 'cruiser' {
  // Always return cruiser - never recommend scout
  return 'cruiser';
}

function extractKeywords(vision: string): string[] {
  const stopWords = ['i', 'want', 'to', 'build', 'create', 'the', 'a', 'an', 'for', 'that'];
  return vision.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w))
    .slice(0, 5);
}