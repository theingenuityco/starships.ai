# Vision Refinement Feature Guide

## Overview

The Vision Refinement feature is an AI-powered system that helps users create, analyze, and iteratively improve their starship vision statements. It provides real-time feedback, quality metrics, and intelligent refinement suggestions to ensure vision statements are clear, specific, actionable, and inspiring.

## Table of Contents

- [Architecture](#architecture)
- [Core Components](#core-components)
- [API Reference](#api-reference)
- [Frontend Components](#frontend-components)
- [Testing](#testing)
- [Performance Optimization](#performance-optimization)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)
- [Configuration](#configuration)

## Architecture

The Vision Refinement system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  SimpleVisionChamber │ VisionMetricsDisplay │ VisionChatContext │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Socket.IO + REST API
                                │
┌─────────────────────────────────────────────────────────────────┐
│                        Service Layer                            │
├─────────────────────────────────────────────────────────────────┤
│ VisionRefinementService │ AffirmationDetector │ MetricsCalculator│
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Repository Pattern
                                │
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                        Neo4j Database                          │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Backend Services

#### VisionRefinementService

The main service responsible for vision analysis and refinement.

**Key Features:**
- AI-powered vision analysis using Claude (Anthropic)
- Context-aware refinement suggestions
- Fallback mechanisms for API failures
- Performance optimizations (caching, debouncing, rate limiting)

**Usage:**
```typescript
import { VisionRefinementService } from '../services/VisionRefinementService';

const service = new VisionRefinementService();

// Analyze a vision statement
const analysis = await service.analyze(visionText);
console.log(`Overall quality: ${analysis.overallConfidence}`);

// Refine based on user feedback
const refinement = await service.refine(
  currentVision, 
  userMessage, 
  conversationContext
);
```

#### AffirmationDetector

Detects user intent from natural language responses.

**Supported Intents:**
- `accept` - User approves the proposal
- `reject` - User rejects the proposal
- `modify` - User wants changes
- `unclear` - Intent cannot be determined

**Usage:**
```typescript
import { AffirmationDetector } from '../services/AffirmationDetector';

const detector = new AffirmationDetector();
const analysis = detector.analyzeResponse("yes, but make it shorter");
// Returns: { intent: 'modify', feedback: ['reduce_length'], ... }
```

#### VisionMetricsCalculator

Calculates quality metrics for vision statements.

**Metrics Calculated:**
- **Clarity Score** (0-100): How clear and understandable
- **Specificity Score** (0-100): How specific and concrete
- **Actionability Score** (0-100): How actionable and implementable
- **Inspirational Score** (0-100): How motivating and inspiring
- **Completeness Flags**: Has objectives, timeframe, measurables

**Usage:**
```typescript
import { VisionMetricsCalculator } from '../services/VisionMetricsCalculator';

const calculator = new VisionMetricsCalculator();
const metrics = await calculator.calculateMetrics(visionText);
```

### Frontend Components

#### SimpleVisionChamber

Main interface for vision creation and editing.

**Features:**
- Real-time vision editing with character count
- Quality indicators based on length
- Socket.IO integration for live updates
- Proposal acceptance/rejection interface

#### VisionMetricsDisplay

Displays comprehensive quality metrics with visualizations.

**Features:**
- Real-time metric updates
- Trend indicators (improvement/regression)
- Completeness status indicators
- Interactive tooltips with explanations

#### VisionChatContextIndicator

Shows vision-related activity in chat interfaces.

**States:**
- `analyzing` - AI is processing the vision
- `proposal_ready` - Refinement proposal available
- `updated` - Vision successfully updated

## API Reference

### REST Endpoints

#### GET /api/starships/:id/vision
Retrieves the current vision for a starship.

**Response:**
```json
{
  "id": "vision-id",
  "starshipId": "starship-id",
  "vision": "Vision statement text",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### PUT /api/starships/:id/vision
Updates the vision for a starship.

**Request Body:**
```json
{
  "vision": "Updated vision statement"
}
```

### Socket.IO Events

#### Client → Server Events

**vision:join-starship-room**
```typescript
{
  starshipId: string;
  userId: string;
}
```

**vision:analyze**
```typescript
{
  starshipId: string;
  vision: string;
  userId: string;
}
```

**vision:refine**
```typescript
{
  starshipId: string;
  currentVision: string;
  userMessage: string;
  conversationContext: ConversationMessage[];
  userId: string;
}
```

**vision:accept-proposal**
```typescript
{
  starshipId: string;
  sessionId: string;
  userId: string;
}
```

#### Server → Client Events

**vision:analyzing**
```typescript
{
  starshipId: string;
  userId: string;
  vision: string;
  sessionId: string;
}
```

**vision:analysis-complete**
```typescript
{
  starshipId: string;
  userId: string;
  analysis: {
    metrics: VisionMetrics;
  };
}
```

**vision:proposal**
```typescript
{
  starshipId: string;
  userId: string;
  sessionId: string;
  proposal: VisionRefinementProposal;
}
```

**vision:updated**
```typescript
{
  starshipId: string;
  userId: string;
  oldVision: string;
  newVision: string;
  metrics: VisionMetrics;
  updateSource: 'user_acceptance' | 'direct_update' | 'chat_integration';
}
```

**vision:error**
```typescript
{
  starshipId: string;
  userId: string;
  errorCode: 'ANALYSIS_FAILED' | 'REFINEMENT_FAILED' | 'RATE_LIMITED' | 'INVALID_INPUT' | 'SESSION_EXPIRED';
  error: string;
}
```

## Testing

### Running Tests

```bash
# Backend unit tests
cd packages/server
npm test

# Frontend component tests  
cd packages/client
npm test

# Integration tests
cd packages/server
npm run test:integration
```

### Test Coverage

| Component | Unit Tests | Integration Tests | Coverage |
|-----------|------------|-------------------|----------|
| VisionRefinementService | ✅ | ✅ | 95% |
| AffirmationDetector | ✅ | ❌ | 92% |
| VisionMetricsCalculator | ✅ | ❌ | 96% |
| SimpleVisionChamber | ✅ | ✅ | 88% |
| VisionMetricsDisplay | ✅ | ❌ | 91% |
| Socket.IO Integration | ❌ | ✅ | 85% |

### Writing Tests

**Example Unit Test:**
```typescript
describe('VisionRefinementService', () => {
  it('should detect vision-related messages', () => {
    const service = new VisionRefinementService();
    expect(service.isVisionRelated('refine our vision')).toBe(true);
    expect(service.isVisionRelated('how is the weather?')).toBe(false);
  });
});
```

**Example Component Test:**
```typescript
import { render, screen } from '@testing-library/react';
import { VisionMetricsDisplay } from '../VisionMetricsDisplay';

test('displays metrics correctly', () => {
  const mockMetrics = { overallQuality: 85, clarityScore: 90 };
  render(<VisionMetricsDisplay metrics={mockMetrics} />);
  expect(screen.getByText('85')).toBeInTheDocument();
});
```

## Performance Optimization

The system includes several performance optimizations:

### Caching
- **Analysis Cache**: Stores recent analysis results (5-minute TTL)
- **Memoization**: Caches function results based on input parameters
- **Socket Room Caching**: Efficient event distribution

### Rate Limiting
- **API Calls**: 20 requests per minute per user
- **Analysis Requests**: Debounced by 1 second for rapid consecutive calls

### Circuit Breaker
- **Failure Threshold**: 5 consecutive failures
- **Recovery Timeout**: 60 seconds
- **Fallback Responses**: Provides basic analysis when AI services fail

### Debouncing
- **Analysis Requests**: 1-second debounce for text input changes
- **Socket Events**: Batched for high-frequency updates

### Code Example:
```typescript
// Enable/disable caching
const analysis = await service.analyze(vision, true); // With cache
const freshAnalysis = await service.analyze(vision, false); // Skip cache

// Performance monitoring
const stats = service.getPerformanceStats();
console.log(`Cache size: ${stats.cacheSize}`);
console.log(`Circuit breaker: ${stats.circuitBreakerState}`);
```

## Monitoring & Logging

### Structured Logging

The system uses structured logging with different levels:

```typescript
import { visionLogger } from '../utils/Logger';

// Analysis logging
const timer = visionLogger.analysisStarted(vision.length, userId, starshipId);
// ... perform analysis ...
visionLogger.analysisCompleted(timer, metrics, userId, starshipId);

// Error logging
visionLogger.analysisError(timer, error, userId, starshipId, vision.length);
```

### Log Levels
- **DEBUG**: Detailed debugging information
- **INFO**: General operational information
- **WARN**: Warning conditions (slow operations, rate limits)
- **ERROR**: Error conditions requiring attention
- **CRITICAL**: Critical errors requiring immediate action

### Performance Metrics

Monitor these key metrics:

- **Analysis Duration**: Time to complete vision analysis
- **Refinement Duration**: Time to generate refinement proposals
- **Cache Hit Rate**: Percentage of requests served from cache
- **Rate Limit Violations**: Number of requests denied due to rate limiting
- **Circuit Breaker State**: Health of external service connections

### Dashboards

Create monitoring dashboards for:
- Request volume and response times
- Error rates by service
- Cache performance
- AI service usage and costs
- User engagement metrics

## Troubleshooting

### Common Issues

#### 1. Analysis Fails with "API authentication failed"
**Cause**: Invalid or missing API keys
**Solution**: 
```bash
# Check environment variables
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Update configuration
export ANTHROPIC_API_KEY="your-key-here"
```

#### 2. Socket.IO Events Not Received
**Cause**: Client not properly joined to room
**Solution**:
```typescript
// Ensure proper room joining
socket.emit('vision:join-starship-room', { starshipId, userId });

// Check connection status
if (!socket.isConnected()) {
  // Handle reconnection
}
```

#### 3. High Memory Usage
**Cause**: Cache not being cleaned up
**Solution**:
```typescript
// Manual cleanup
service.resetPerformanceState();

// Check cache stats
const stats = service.getPerformanceStats();
console.log('Cache size:', stats.cacheSize);
```

#### 4. Slow Analysis Performance
**Cause**: Rate limiting or API latency
**Solution**:
- Check circuit breaker state
- Verify cache hit rates
- Monitor AI service status
- Consider increasing debounce delays

### Debugging

Enable debug logging:
```typescript
import { Logger, LogLevel } from '../utils/Logger';

const logger = Logger.getInstance(LogLevel.DEBUG);
```

Check service health:
```typescript
// Backend health check
const health = await service.getPerformanceStats();

// Frontend component debugging
<VisionMetricsDisplay 
  metrics={metrics} 
  className="debug-metrics" // Add debug styling
/>
```

## Configuration

### Environment Variables

```bash
# AI Service Configuration
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Performance Settings
VISION_CACHE_TTL=300000          # 5 minutes
VISION_RATE_LIMIT=20             # requests per minute
VISION_DEBOUNCE_DELAY=1000       # milliseconds
VISION_CIRCUIT_BREAKER_THRESHOLD=5
VISION_CIRCUIT_BREAKER_TIMEOUT=60000

# Database
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[DEFAULT-PASSWORD]
```

### Client Configuration

```typescript
// Socket.IO configuration
const socket = new SocketClient({
  url: process.env.NEXT_PUBLIC_SERVER_URL,
  options: {
    transports: ['websocket', 'polling'],
    timeout: 10000
  }
});

// Component configuration
<SimpleVisionChamber 
  debounceDelay={1000}
  maxVisionLength={5000}
  enableAnalytics={true}
/>
```

### Service Configuration

```typescript
// VisionRefinementService options
const service = new VisionRefinementService({
  cacheEnabled: true,
  rateLimitEnabled: true,
  circuitBreakerEnabled: true,
  fallbackEnabled: true
});
```

## Security Considerations

### Input Validation
- All user inputs are sanitized and validated
- Vision statements limited to 5000 characters
- User messages limited to 1000 characters

### Rate Limiting
- Per-user rate limiting prevents abuse
- Circuit breakers protect against service failures
- API key rotation supported

### Data Protection
- Vision statements are encrypted at rest
- User data is anonymized in logs
- GDPR compliance for data deletion

## Future Enhancements

### Planned Features
- **Multi-language Support**: Analyze visions in different languages
- **Industry Templates**: Pre-built vision templates by industry
- **Collaborative Editing**: Multi-user vision refinement sessions
- **Advanced Analytics**: Historical trend analysis
- **API Integration**: Export to popular project management tools

### Roadmap
- **Q1 2024**: Multi-language support
- **Q2 2024**: Industry templates and collaborative editing
- **Q3 2024**: Advanced analytics dashboard
- **Q4 2024**: Third-party integrations

## Support

For technical support or questions:
- **Documentation**: Check this guide and API documentation
- **Logs**: Review application logs for detailed error information
- **Monitoring**: Check service health dashboards
- **Testing**: Run the test suite to verify functionality

### Getting Help
1. Check the troubleshooting section
2. Review recent logs for error details
3. Verify configuration settings
4. Test with minimal examples
5. Contact development team with specific error details

---

*Last updated: January 2024*
*Version: 1.0.0*