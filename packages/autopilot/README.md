# @starships/autopilot

Generic workflow DSL execution engine for starships.ai.

## Features

- **Graph-based execution** - True DAG support with conditional routing
- **Extensible node system** - Plugin architecture for custom node types  
- **Interactive workflows** - Built-in user input capabilities
- **JSONata integration** - Powerful expressions for conditional logic
- **Event-driven** - Comprehensive lifecycle hooks
- **Visual programming** - React Flow integration ready

## Quick Start

```typescript
import { Engine, defaultRegistry, Validator, type Workflow } from '@starships/autopilot';

// Create workflow
const workflow: Workflow = {
  id: 'example-workflow',
  expeditionId: 'exp-1',
  nodes: [
    { id: 'start', type: 'start', name: 'Start', description: 'Begin', parameters: {} },
    { id: 'end', type: 'end', name: 'End', description: 'Complete', parameters: {} }
  ],
  edges: [
    { id: 'edge-1', from: 'start', to: 'end' }
  ],
  approvalStatus: 'approved',
  visualization: '',
  createdAt: new Date().toISOString()
};

// Validate workflow
const validator = new Validator();
const validation = validator.validate(workflow);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Execute workflow
const engine = new Engine(defaultRegistry);
const result = await engine.execute(workflow, {
  userId: 'user-1'
});

console.log('Execution result:', result);
```

## Node Types

- **start/end** - Flow control nodes
- **agent** - AI agent task execution
- **conditional** - Smart routing with JSONata expressions
- **user_prompt** - Interactive user input
- **output** - Result formatting and delivery

## Extension

```typescript
import { Handler, Registry, type Node, type NodeResult } from '@starships/autopilot';

class CustomHandler implements Handler {
  readonly type = 'custom';

  async execute(node: Node, context: ExecutionContext): Promise<NodeResult> {
    // Custom logic here
    return {
      nodeId: node.id,
      success: true,
      data: { result: 'custom execution' },
      executedAt: new Date().toISOString()
    };
  }

  validate(node: Node) {
    return { valid: true, errors: [], warnings: [], suggestions: [] };
  }

  getIcon() {
    return 'custom-icon';
  }
}

// Register custom handler
const registry = new Registry();
registry.register(new CustomHandler());
```

## API Reference

### Engine

Main workflow execution engine.

```typescript
const engine = new Engine(registry);
const result = await engine.execute(workflow, context);
```

### Registry

Node handler registry for managing workflow node types.

```typescript
const registry = new Registry();
registry.register(new CustomHandler());
```

### Validator

Workflow structure validator.

```typescript
const validator = new Validator();
const result = validator.validate(workflow);
```

## Development

```bash
# Build the package
pnpm run build

# Type check
pnpm run type-check

# Lint code
pnpm run lint
```

## License

MIT