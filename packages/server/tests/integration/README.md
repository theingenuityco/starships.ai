# Connector Instance Integration Tests

This directory contains comprehensive integration tests for the connector instance architecture, validating the complete end-to-end workflow from frontend components through backend API endpoints to the database layer.

## Test Suite Overview

### 🧪 Test Files

1. **`connector-instance-api.integration.test.ts`**
   - Tests all backend API endpoints for connector instance management
   - Validates CRUD operations, error handling, and data consistency
   - Covers authentication, authorization, and input validation

2. **`end-to-end-connector-workflow.test.ts`**
   - Comprehensive end-to-end workflow validation
   - Tests frontend-backend integration
   - Validates real-time status updates and cache invalidation
   - Tests error handling across the entire stack

3. **`connector-workflow-demo.ts`**
   - Interactive demo simulating real user workflows
   - Demonstrates complete connector lifecycle management
   - Shows error handling and recovery scenarios

4. **`run-connector-tests.ts`**
   - Master test runner that executes all test suites
   - Provides comprehensive reporting and validation status
   - Generates production readiness assessment

## Architecture Components Tested

### ✅ Frontend Layer

- **StarshipCrewContent Component**: Manages connector instance state and UI
- **ConnectorSelector Component**: Handles connector template selection and instance management
- **API Integration**: Frontend-to-backend communication and error handling

### ✅ Backend Layer

- **API Endpoints**: All `/api/starships/:id/connectors/*` routes
- **Authentication & Authorization**: User access control and starship ownership
- **Input Validation**: UUID format validation, status validation, payload validation
- **Error Handling**: Custom error types and HTTP status codes

### ✅ Repository Layer

- **StarshipRepository**: Connector instance management methods
- **MCPServerConnectorRepository**: Full CRUD operations for connector instances
- **MCPServerOptionRepository**: Template management and validation

### ✅ Database Layer

- **Connector Instance Schema**: Node structure and relationships
- **Constraints**: Uniqueness constraints and foreign key relationships
- **Data Consistency**: Transaction handling and constraint validation

## Test Coverage

### 🔍 API Endpoint Tests

- `GET /starships/:id/connectors` - List connector instances
- `POST /starships/:id/connectors/:templateId` - Create connector instance
- `PUT /starships/:id/connectors/:connectorId` - Update connector instance
- `DELETE /starships/:id/connectors/:connectorId` - Remove connector instance
- `GET /starships/:id/connectors/:connectorId` - Get specific connector instance

### 🔄 Workflow Tests

- Complete CRUD workflow validation
- Frontend-backend integration testing
- Real-time status update verification
- Cache invalidation testing
- Concurrent operation handling
- Data consistency validation
- Performance and scalability testing

### ⚠️ Error Handling Tests

- Database constraint violation handling
- Network error resilience
- Validation error feedback
- Authentication/authorization failures
- Resource not found scenarios
- Malformed request handling

### 👤 User Journey Tests

- Connector discovery and browsing
- Connector instance creation and management
- Status monitoring and lifecycle management
- Error recovery workflows
- Bulk operations and advanced management

## Prerequisites

### Environment Setup

```bash
# Required environment variables
export NEO4J_URI="[NEO4J-LOCAL-URL]"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="your-[DEFAULT-PASSWORD]"
export NEO4J_DATABASE="neo4j"
export API_BASE_URL="http://localhost:3001"
```

### Dependencies

- Neo4j database running and accessible
- Backend server running on specified port
- MCP server templates seeded in database
- Test authentication token configured

## Running the Tests

### 🚀 Run All Tests (Recommended)

```bash
# Run comprehensive test suite
npm run test:connector-integration

# Or run directly with ts-node
npx ts-node packages/server/tests/integration/run-connector-tests.ts
```

### 🔧 Run Individual Test Suites

#### Backend API Tests Only

```bash
npx ts-node packages/server/tests/integration/connector-instance-api.integration.test.ts
```

#### End-to-End Workflow Tests Only

```bash
npx ts-node packages/server/tests/integration/end-to-end-connector-workflow.test.ts
```

#### User Journey Demo Only

```bash
npx ts-node packages/server/tests/integration/connector-workflow-demo.ts
```

## Test Results Interpretation

### ✅ Success Criteria

- **100% Pass Rate**: All tests pass without errors
- **Response Times**: API responses under 1 second
- **Data Consistency**: Database state matches API responses
- **Error Handling**: Graceful error handling with appropriate HTTP status codes
- **Cache Invalidation**: Real-time updates reflected immediately

### 📊 Test Output

The test runner provides detailed output including:

- Individual test results with timing
- Test suite summaries
- Overall success rate
- Performance metrics
- Production readiness assessment
- Architecture component validation status

### 🎯 Production Readiness Levels

- **95%+ Success Rate**: Production ready
- **80-94% Success Rate**: Minor fixes needed
- **<80% Success Rate**: Major fixes required

## Common Issues and Troubleshooting

### 🔧 Database Connection Issues

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Verify connection
curl -u neo4j:[DEFAULT-PASSWORD] http://localhost:7474/db/data/
```

### 🔧 Server Connection Issues

```bash
# Check server is running
curl http://localhost:3001/api/health

# Check server logs for errors
npm run dev:server
```

### 🔧 Test Data Cleanup

Tests automatically clean up their data, but if needed:

```bash
# Manual cleanup (if tests are interrupted)
# Connect to Neo4j and run:
MATCH (n:MCPServerConnector) WHERE n.starshipId CONTAINS 'test' DETACH DELETE n;
MATCH (n:Starship) WHERE n.name CONTAINS 'Test' DETACH DELETE n;
MATCH (n:User) WHERE n.email CONTAINS 'test' DETACH DELETE n;
```

## Test Development Guidelines

### 🧪 Adding New Tests

1. Follow the existing test structure and naming conventions
2. Include proper setup and cleanup
3. Test both success and failure scenarios
4. Add comprehensive error handling
5. Update this README with new test descriptions

### 📝 Test Best Practices

- Use descriptive test names that explain what is being tested
- Include both positive and negative test cases
- Test edge cases and boundary conditions
- Ensure tests are independent and can run in any order
- Clean up test data to avoid interference between tests

## Integration with CI/CD

### 🔄 Automated Testing

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run Connector Integration Tests
  run: |
    npm run test:connector-integration
  env:
    NEO4J_URI: ${{ secrets.NEO4J_URI }}
    NEO4J_USERNAME: ${{ secrets.NEO4J_USERNAME }}
    NEO4J_PASSWORD: ${{ secrets.NEO4J_PASSWORD }}
    API_BASE_URL: http://localhost:3001
```

### 📈 Test Reporting

Test results can be exported in various formats:

- Console output with detailed results
- JSON reports for CI/CD integration
- Performance metrics for monitoring
- Architecture validation status

## Architecture Validation

The test suite validates the complete connector instance architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│                 │    │                 │    │                 │
│ StarshipCrew    │◄──►│ /api/starships/ │◄──►│ Neo4j Nodes &   │
│ Content         │    │ :id/connectors  │    │ Relationships   │
│                 │    │                 │    │                 │
│ Connector       │    │ StarshipRepo    │    │ MCPServer       │
│ Selector        │    │ MCPConnector    │    │ Connector       │
│                 │    │ Repo            │    │ Instances       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

All components are thoroughly tested to ensure:

- **Data Flow**: Information flows correctly between layers
- **Error Propagation**: Errors are handled gracefully at each layer
- **State Consistency**: UI state matches database state
- **Performance**: Operations complete within acceptable timeframes
- **Scalability**: System handles multiple concurrent operations

## Conclusion

This comprehensive test suite ensures the connector instance architecture is robust, reliable, and ready for production use. The tests validate not only individual components but also their integration and the complete user experience.

For questions or issues with the tests, please refer to the troubleshooting section or contact the development team.
