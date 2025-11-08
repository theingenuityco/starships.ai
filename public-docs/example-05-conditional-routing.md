## Example 05 — Conditional routing (booleans and labels)

Goal: Route based on a computed condition.

Code

```ts
import { Engine, ExecutionItemUtils } from '@starships/autopilot';

const blueprint = {
  nodes: [
    { ref: 's', type: 'start', name: 'Start', parameters: {} },
    {
      ref: 'compute',
      type: 'code',
      name: 'Compute',
      parameters: {
        code: `
          async function main(ctx) {
            const n = Number((ctx.$input && ctx.$input.value) ?? 0);
            return { isEven: n % 2 === 0, label: n > 10 ? "big" : "small" };
          }
        `,
      },
    },
    {
      ref: 'cond1',
      type: 'conditional',
      name: 'Even?',
      parameters: {
        condition: '{{ $lastOutputOf("compute")?.[0]?.json?.isEven ?? false }}', // yields 'true' or 'false'
      },
    },
    {
      ref: 'cond2',
      type: 'conditional',
      name: 'Size',
      parameters: { condition: '{{ $lastOutputOf("compute")?.[0]?.json?.label }}' }, // yields 'big' or 'small'
    },
    { ref: 'even', type: 'end', name: 'Even', parameters: { output: 'even' } },
    { ref: 'odd', type: 'end', name: 'Odd', parameters: { output: 'odd' } },
    { ref: 'big', type: 'end', name: 'Big', parameters: { output: 'big' } },
    { ref: 'small', type: 'end', name: 'Small', parameters: { output: 'small' } },
  ],
  edges: [
    { ref: 'e1', from: 's', to: 'compute' },
    { ref: 'e2', from: 'compute', to: 'cond1' },
    { ref: 'e3', from: 'cond1', to: 'even', condition: 'true' },
    { ref: 'e4', from: 'cond1', to: 'odd', condition: 'false' },
    { ref: 'e5', from: 'even', to: 'cond2' },
    { ref: 'e6', from: 'odd', to: 'cond2' },
    { ref: 'e7', from: 'cond2', to: 'big', condition: 'big' },
    { ref: 'e8', from: 'cond2', to: 'small', condition: 'small' },
  ],
};

const engine = new Engine();
const exec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle({ value: 12 }));
const out = await engine.executeBlueprint(blueprint, exec);
// even -> 'big'
```

