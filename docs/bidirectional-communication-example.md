# Bidirectional Communication Between Agents and First Officer

## Overview

The bidirectional communication system enables agents to actively communicate with their First Officer for clarification, report blockers, and receive real-time guidance. This creates a more collaborative expedition experience where agents aren't just task executors but active participants.

## Key Features

1. **Agent Awareness**: Agents know who their First Officer is and can reach out proactively
2. **Multiple Communication Types**: Clarification requests, blocker reports, progress updates, assistance requests
3. **Real-time Guidance**: First Officer can provide immediate help and coordinate between agents
4. **Persistent History**: All communications are stored for context and learning

## API Endpoints

### 1. Get First Officer Context
```bash
GET /api/agent-communication/:expeditionId/:agentId/context
```

Returns the agent's awareness context including:
- First Officer identity
- Assigned tasks
- Communication capabilities

### 2. Send General Message
```bash
POST /api/agent-communication/:expeditionId/:agentId/message
```

Body:
```json
{
  "agentName": "Python Coder",
  "messageType": "progress-update",
  "content": "I've completed the initial API structure",
  "priority": "medium",
  "requiresResponse": false
}
```

### 3. Request Clarification
```bash
POST /api/agent-communication/:expeditionId/:agentId/clarification
```

Body:
```json
{
  "agentName": "Python Coder",
  "taskId": "task-123",
  "taskTitle": "Implement user authentication",
  "aspect": "requirements",
  "specificQuestion": "Should we use JWT or session-based authentication?",
  "currentUnderstanding": "I understand we need secure authentication, but the approach isn't specified",
  "proposedApproach": "I suggest using JWT for stateless authentication"
}
```

### 4. Report Blocker
```bash
POST /api/agent-communication/:expeditionId/:agentId/blocker
```

Body:
```json
{
  "agentName": "Frontend Developer",
  "taskId": "task-456",
  "taskTitle": "Create dashboard UI",
  "type": "dependency",
  "description": "API endpoints are not ready yet",
  "impact": "major",
  "attemptedSolutions": [
    "Created mock data for development",
    "Tried to work with backend team"
  ],
  "suggestedResolution": "Need API specs or mock server setup"
}
```

### 5. Send Progress Update
```bash
POST /api/agent-communication/:expeditionId/:agentId/progress
```

Body:
```json
{
  "agentName": "Data Analyst",
  "taskId": "task-789",
  "taskTitle": "Analyze user behavior",
  "percentComplete": 65,
  "milestonesCompleted": ["Data collection", "Initial analysis"],
  "currentActivity": "Creating visualization charts",
  "estimatedTimeRemaining": 120,
  "confidence": "high",
  "insights": ["User engagement peaks on weekends", "Mobile usage is 70%"]
}
```

### 6. Request Assistance
```bash
POST /api/agent-communication/:expeditionId/:agentId/assistance
```

Body:
```json
{
  "agentName": "Backend Developer",
  "taskId": "task-321",
  "taskTitle": "Optimize database queries",
  "type": "expertise",
  "skillsNeeded": ["SQL", "database optimization"],
  "estimatedDuration": 60,
  "description": "Need help optimizing complex JOIN queries",
  "preferredAgent": "Database Expert"
}
```

## Communication Flow Example

### Scenario: Agent needs clarification on a task

1. **Agent detects ambiguity**:
   ```javascript
   // Agent realizes authentication method isn't specified
   const clarification = await agentAPI.requestClarification({
     aspect: 'requirements',
     specificQuestion: 'Should we use JWT or session-based auth?',
     currentUnderstanding: 'Need secure authentication',
     proposedApproach: 'JWT for stateless auth'
   });
   ```

2. **First Officer receives and processes**:
   - Virtual First Officer analyzes the question
   - Considers expedition context and requirements
   - Formulates clear guidance

3. **First Officer responds**:
   ```json
   {
     "messageType": "clarification-response",
     "content": "Use JWT authentication. It aligns with our microservices architecture and allows easier scaling. Here's the approach: 1) Use RS256 algorithm, 2) 15-minute access tokens, 3) 7-day refresh tokens",
     "clarification": {
       "answer": "JWT with specific configuration",
       "additionalContext": "This supports our stateless architecture goals",
       "examples": ["Authorization: Bearer <token>"],
       "resources": ["jwt.io/introduction"]
     }
   }
   ```

4. **Agent proceeds with clarity**:
   - Implements JWT authentication
   - Updates progress
   - Can ask follow-up questions if needed

## Message Types

### Agent to First Officer:
- `clarification-request`: Need help understanding requirements
- `blocker-report`: Stuck and need assistance
- `progress-update`: Proactive status report
- `resource-request`: Need additional resources
- `assistance-request`: Need help from another agent
- `completion-report`: Task done, what's next?
- `error-report`: Something went wrong
- `capability-update`: Agent's skills have changed

### First Officer to Agent:
- `task-assignment`: New task for the agent
- `clarification-response`: Answer to agent's question
- `guidance`: Proactive help or tips
- `priority-update`: Task priority changed
- `resource-allocation`: Resources provided
- `assistance-approval`: Another agent will help
- `status-inquiry`: Checking on progress
- `encouragement`: Motivational support
- `strategy-update`: Overall approach has changed

## Benefits

1. **Reduced Confusion**: Agents can clarify ambiguities immediately
2. **Faster Problem Resolution**: Blockers are reported and resolved quickly
3. **Better Coordination**: First Officer has real-time visibility into issues
4. **Improved Quality**: Agents get guidance before making mistakes
5. **Enhanced Collaboration**: Agents can be paired for complex tasks

## Implementation Details

The system uses:
- **Protocol types** in `@starships/protocol/agent-communication.ts`
- **Service layer** in `BidirectionalCommunicationService.ts`
- **REST API** in `routes/agent-communication.ts`
- **Database persistence** for all messages
- **Virtual First Officer** for intelligent responses

## Future Enhancements

1. **WebSocket Integration**: Real-time bidirectional communication
2. **Agent Learning**: Agents learn from clarifications to ask better questions
3. **Automated Pairing**: AI suggests agent collaborations
4. **Predictive Guidance**: First Officer anticipates issues before they occur
5. **Multi-modal Communication**: Support for images, code snippets, diagrams