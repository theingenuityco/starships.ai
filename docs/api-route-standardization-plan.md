# API Route Standardization Plan

## Overview

This document outlines the standardization of API routes for the Starships.ai server to follow OpenAPI best practices and ensure consistency across all endpoints.

## Current State Issues

### Identified Problems
1. **Inconsistent URL patterns**: Mixed use of resource names in paths (`/starships/starships` vs `/agents/`)
2. **Response format inconsistency**: Some endpoints wrap responses, others return data directly
3. **Error handling variance**: Different error structures across endpoints
4. **Sub-resource patterns**: Inconsistent hierarchical resource handling
5. **Query parameter inconsistency**: Different parameter naming and validation approaches

## Target Architecture

### URL Structure Standard
```
/api/v1/{resource}                           # Collection operations
/api/v1/{resource}/{id}                      # Individual resource operations
/api/v1/{resource}/{id}/{sub-resource}       # Sub-resource collections
/api/v1/{resource}/{id}/{sub-resource}/{sub-id} # Individual sub-resources
```

### HTTP Method Standards
- `GET` - Retrieve resource(s)
- `POST` - Create new resource
- `PUT` - Update entire resource
- `PATCH` - Partial update resource
- `DELETE` - Delete resource

### Response Format Standards

#### Success Response Structure
```json
{
  "data": {},                    // The actual response data
  "meta": {                      // Optional metadata
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 123,
      "has_next": true,
      "has_prev": false
    },
    "filters": {},              // Applied filters
    "sort": {}                  // Applied sorting
  }
}
```

#### Error Response Structure
```json
{
  "error": {
    "code": "VALIDATION_ERROR",     // Machine-readable error code
    "message": "Validation failed", // Human-readable message
    "details": {                    // Additional context (optional)
      "field": "agentId",
      "constraint": "uuid_format",
      "provided": "invalid-id"
    }
  }
}
```

#### HTTP Status Codes
- `200 OK` - Successful GET, PUT, PATCH
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Validation errors, malformed requests
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Authorization denied
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (duplicate, constraint violation)
- `422 Unprocessable Entity` - Business logic validation errors
- `500 Internal Server Error` - Unexpected server errors
- `503 Service Unavailable` - Service temporarily unavailable

## Route Migration Plan

### Phase 1: Core Resources

#### Agents Routes
**Current → Target**
```
GET    /agents                    → /api/v1/agents
GET    /agents/public             → /api/v1/agents/public  
GET    /agents/search             → /api/v1/agents/search
GET    /agents/:id                → /api/v1/agents/{id}
POST   /agents                    → /api/v1/agents
PUT    /agents/:id                → /api/v1/agents/{id}
DELETE /agents/:id                → /api/v1/agents/{id}
GET    /agents/:id/analytics      → /api/v1/agents/{id}/analytics
POST   /agents/:id/rate           → /api/v1/agents/{id}/ratings
POST   /agents/:id/track-usage    → /api/v1/agents/{id}/usage
GET    /agents/starship/:starshipId → /api/v1/agents?starshipId={id}
PUT    /agents/:id/starship       → /api/v1/agents/{id}/starship
```

#### Starships Routes  
**Current → Target**
```
GET    /starships                      → /api/v1/starships
POST   /starships                      → /api/v1/starships
POST   /starships/create-paid          → /api/v1/starships (with plan parameter)
GET    /starships/:idOrSlug            → /api/v1/starships/{id}
PUT    /starships/:id                  → /api/v1/starships/{id}
DELETE /starships/:id                  → /api/v1/starships/{id}
GET    /starships/:id/agents           → /api/v1/starships/{id}/agents
POST   /starships/:id/agents/:agentId/deploy → /api/v1/starships/{id}/agents/{agentId}
DELETE /starships/:id/agents/:agentId  → /api/v1/starships/{id}/agents/{agentId}
POST   /:id/billing-portal             → /api/v1/starships/{id}/billing-portal
POST   /starships/:id/retry-payment    → /api/v1/starships/{id}/retry-payment
GET    /pricing                        → /api/v1/pricing
POST   /checkout-session               → /api/v1/checkout-sessions
```

#### Missions Routes
**Current → Target** 
```
GET    /missions                       → /api/v1/missions
POST   /missions                       → /api/v1/missions
GET    /missions/:id                   → /api/v1/missions/{id}
PUT    /missions/:id                   → /api/v1/missions/{id}
DELETE /missions/:id                   → /api/v1/missions/{id}
GET    /missions/starship/:starshipId  → /api/v1/missions?starshipId={id}
GET    /missions/:id/messages          → /api/v1/missions/{id}/messages
POST   /missions/:id/messages          → /api/v1/missions/{id}/messages
GET    /missions/:id/clarity           → /api/v1/missions/{id}/clarity
GET    /missions/:id/workflow          → /api/v1/missions/{id}/workflow
PUT    /missions/:id/workflow/approval → /api/v1/missions/{id}/workflow
POST   /missions/:id/regenerate-workflow → /api/v1/missions/{id}/workflow/regenerate
GET    /missions/:id/execution-status  → /api/v1/missions/{id}/execution-status
```

#### Chat/Conversations Routes
**Current → Target**
```
POST   /chat                             → /api/v1/conversations/{id}/messages
DELETE /chat/:sessionKey/memory          → /api/v1/conversations/{id}/memory
GET    /chat/messages/memory/:memoryId   → /api/v1/conversations/{id}/messages
GET    /chat/memories/starship/:starshipId → /api/v1/starships/{id}/memories
GET    /chat/conversation/:conversationId → /api/v1/conversations/{id}
```

#### Health Routes
**Current → Target**
```
GET    /health          → /api/v1/health
GET    /health/detailed → /api/v1/health/detailed
GET    /health/ready    → /api/v1/health/ready
GET    /health/live     → /api/v1/health/live
GET    /health/metrics  → /api/v1/health/metrics
```

### Phase 2: Query Parameter Standards

#### Pagination
```
?page=1&limit=50&offset=0
```

#### Sorting
```
?sort=createdAt&order=desc
// or
?sort=-createdAt  (desc with prefix)
```

#### Filtering
```
?status=active&category=ai&isPublic=true
```

#### Search
```
?search=query&searchFields=name,description
```

#### Include Related Data
```
?include=agents,missions
```

### Phase 3: Request/Response Transformations

#### Request Body Standards
- Use camelCase for JSON properties
- Validate all required fields
- Apply proper type validation
- Use consistent naming patterns

#### Response Transformations
All endpoints will be updated to return the standard response format:

**Collection Response:**
```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 123,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

**Single Resource Response:**
```json
{
  "data": {...}
}
```

**Error Response:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Agent not found",
    "details": {
      "resource": "agent",
      "id": "123e4567-e89b-12d3-a456-426614174000"
    }
  }
}
```

## Implementation Strategy

### 1. Backward Compatibility
- Maintain existing routes during transition
- Add deprecation headers to old routes
- Provide migration timeline to clients

### 2. Route Registration
- Update Express router configuration
- Implement route versioning middleware
- Add API documentation generation

### 3. Response Transformation Middleware
- Create standard response wrapper middleware
- Implement consistent error handling middleware
- Add request validation middleware

### 4. Testing Strategy
- Update existing tests for new route patterns
- Add integration tests for route consistency
- Validate response format compliance

## Error Code Standardization

### Validation Errors (4xx)
- `VALIDATION_ERROR` - General validation failure
- `REQUIRED_FIELD_MISSING` - Required field not provided
- `INVALID_FORMAT` - Field format validation failed
- `INVALID_VALUE` - Field value not in allowed set

### Authentication/Authorization (4xx)
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Access denied
- `INVALID_TOKEN` - JWT token invalid

### Resource Errors (4xx)
- `RESOURCE_NOT_FOUND` - Resource doesn't exist
- `RESOURCE_CONFLICT` - Resource already exists
- `RESOURCE_CONSTRAINT_VIOLATION` - Constraint violation

### Business Logic Errors (4xx)
- `BUSINESS_RULE_VIOLATION` - Business logic constraint failed
- `INSUFFICIENT_PERMISSIONS` - Operation not allowed
- `QUOTA_EXCEEDED` - Resource limit exceeded

### System Errors (5xx)
- `INTERNAL_SERVER_ERROR` - Unexpected server error
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable
- `DATABASE_ERROR` - Database operation failed

## Breaking Changes

### URL Changes
- All routes now include `/api/v1` prefix
- Resource collections use consistent naming
- Sub-resources follow hierarchical patterns

### Response Format Changes
- All responses wrapped in `{ data: ... }` structure
- Error responses use consistent `{ error: ... }` structure
- Pagination metadata moved to `meta.pagination`

### Query Parameter Changes
- Standardized parameter names (`page`, `limit`, `sort`, `order`)
- Consistent filtering patterns
- Search parameter standardization

## Migration Timeline

### Week 1: Documentation and Planning
- [ ] Finalize route mapping
- [ ] Update API documentation
- [ ] Communicate changes to frontend teams

### Week 2: Core Infrastructure
- [ ] Implement response wrapper middleware
- [ ] Create error handling middleware  
- [ ] Set up route versioning

### Week 3: Route Refactoring
- [ ] Migrate health routes
- [ ] Migrate agents routes
- [ ] Migrate starships routes

### Week 4: Route Refactoring Continued
- [ ] Migrate missions routes
- [ ] Migrate chat/conversations routes
- [ ] Update remaining routes

### Week 5: Testing and Validation
- [ ] Update test suites
- [ ] Integration testing
- [ ] Performance validation

### Week 6: Deprecation and Cleanup
- [ ] Add deprecation warnings to old routes
- [ ] Update client documentation
- [ ] Plan removal of deprecated routes

## Success Metrics

1. **Consistency**: All routes follow the same URL pattern
2. **Response Format**: All endpoints return uniform response structure
3. **Error Handling**: Consistent error codes and formats
4. **Documentation**: Complete API documentation with examples
5. **Performance**: No degradation in API performance
6. **Compatibility**: Smooth migration path for existing clients

## Future Considerations

1. **API Versioning**: Ready for v2 when needed
2. **OpenAPI Spec**: Generate OpenAPI 3.0 specification
3. **Rate Limiting**: Consistent rate limiting across endpoints
4. **Caching**: Uniform caching strategies
5. **Monitoring**: Standardized metrics and logging