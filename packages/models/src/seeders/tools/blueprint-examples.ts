import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Tool: blueprint_examples
 * Provides comprehensive blueprint examples for various use cases
 */
export const blueprintExamplesTool: ToolParams = {
  name: 'blueprint_examples',
  description: `Query a library of working blueprint examples for different scenarios and patterns.

## Purpose
Provides real-world, tested blueprint examples showing proper structure, node usage, error handling, and advanced patterns.

## Example Categories
- **basic**: Simple linear workflows
- **conditional**: Branching and decision logic
- **loops**: Tool calling loops and iterations
- **api_integration**: HTTP requests and API workflows
- **llm_patterns**: LLM usage patterns with tools
- **error_handling**: Resilient workflows with error recovery
- **state_management**: Complex state transformations
- **nested**: Workflows with nested blueprints

## Response Format
Returns complete, executable blueprints with:
- Detailed node configurations
- Proper edge connections
- Template expression examples
- Comments explaining the pattern`,
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['basic', 'conditional', 'loops', 'api_integration', 'llm_patterns', 'error_handling', 'state_management', 'nested', 'all'],
        description: 'Category of examples to retrieve',
      },
      pattern: {
        type: 'string',
        description: 'Specific pattern name within category (optional)',
      },
    },
    required: ['category'],
  },
  blueprint: {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'fetch_examples',
        type: 'code',
        name: 'Fetch Blueprint Examples',
        description: 'Return blueprint examples for the requested category',
        parameters: {
          code: `
            const category = input.category || 'all';
            const pattern = input.pattern;
            
            const examples = {
              basic: {
                simple_llm: {
                  name: 'Simple LLM Query',
                  description: 'Basic LLM call with response',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'llm_1',
                        type: 'llm',
                        name: 'Ask AI',
                        parameters: {
                          model: 'anthropic/claude-3-haiku',
                          messages: [
                            { role: 'user', content: '{{ $input("question") }}' }
                          ],
                          temperature: 0.7,
                          maxTokens: 500
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {
                          output: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.content }}'
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'llm_1' },
                      { ref: 'e2', from: 'llm_1', to: 'end_1' }
                    ]
                  }
                },
                http_fetch: {
                  name: 'HTTP API Call',
                  description: 'Fetch data from API and transform',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'api_1',
                        type: 'http_request',
                        name: 'Fetch Data',
                        parameters: {
                          url: '{{ env("API_BASE") }}/data/{{ $input("id") }}',
                          method: 'GET',
                          headers: {
                            'Authorization': 'Bearer {{ env("API_TOKEN") }}'
                          }
                        }
                      },
                      {
                        ref: 'transform_1',
                        type: 'transform',
                        name: 'Extract Fields',
                        parameters: {
                          transforms: [
                            {
                              operation: 'add',
                              path: '/result',
                              value: '{{ $lastOutputOf("api_1")[0].json.body.data }}'
                            }
                          ]
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {
                          output: '{{ $lastOutputOf("transform_1")[0].json.result }}'
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'api_1' },
                      { ref: 'e2', from: 'api_1', to: 'transform_1' },
                      { ref: 'e3', from: 'transform_1', to: 'end_1' }
                    ]
                  }
                }
              },
              conditional: {
                api_retry: {
                  name: 'API Call with Conditional Retry',
                  description: 'Retry failed API calls up to 3 times',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'init_state',
                        type: 'mutate',
                        name: 'Initialize Retry Count',
                        parameters: {
                          mutations: [
                            { operation: 'add', path: '/state/retryCount', value: 0 }
                          ]
                        }
                      },
                      {
                        ref: 'api_call',
                        type: 'http_request',
                        name: 'Call API',
                        parameters: {
                          url: '{{ $input("url") }}',
                          method: 'POST',
                          body: '{{ $input("payload") }}',
                          timeout: 5000
                        }
                      },
                      {
                        ref: 'check_status',
                        type: 'conditional',
                        name: 'Check Success',
                        parameters: {
                          condition: '{{ $lastOutputOf("api_call")[0].json?.status === 200 ? "success" : "retry" }}'
                        }
                      },
                      {
                        ref: 'increment_retry',
                        type: 'mutate',
                        name: 'Increment Retry',
                        parameters: {
                          mutations: [
                            { operation: 'replace', path: '/state/retryCount', value: '{{ state.retryCount + 1 }}' }
                          ]
                        }
                      },
                      {
                        ref: 'check_retry_limit',
                        type: 'conditional',
                        name: 'Check Retry Limit',
                        parameters: {
                          condition: '{{ state.retryCount < 3 ? "retry" : "fail" }}'
                        }
                      },
                      {
                        ref: 'success_end',
                        type: 'end',
                        name: 'Success',
                        parameters: {
                          output: '{{ $lastOutputOf("api_call")[0].json }}'
                        }
                      },
                      {
                        ref: 'fail_end',
                        type: 'end',
                        name: 'Failed',
                        parameters: {
                          output: { error: 'API call failed after 3 retries' }
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'init_state' },
                      { ref: 'e2', from: 'init_state', to: 'api_call' },
                      { ref: 'e3', from: 'api_call', to: 'check_status' },
                      { ref: 'e4', from: 'check_status', to: 'success_end', condition: 'success' },
                      { ref: 'e5', from: 'check_status', to: 'increment_retry', condition: 'retry' },
                      { ref: 'e6', from: 'increment_retry', to: 'check_retry_limit' },
                      { ref: 'e7', from: 'check_retry_limit', to: 'api_call', condition: 'retry' },
                      { ref: 'e8', from: 'check_retry_limit', to: 'fail_end', condition: 'fail' }
                    ]
                  }
                }
              },
              llm_patterns: {
                tool_calling_loop: {
                  name: 'LLM with Tool Calling Loop',
                  description: 'Agent blueprint with automatic tool execution',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'llm_1',
                        type: 'llm',
                        name: 'AI with Tools',
                        parameters: {
                          model: '{{ state.model }}',
                          messages: '{{ state.messages }}',
                          tools: '{{ state.tools }}',
                          temperature: 0.7,
                          mutations: [
                            {
                              operation: 'add',
                              path: '/state/messages/-',
                              value: {
                                role: 'assistant',
                                content: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.content }}',
                                toolCalls: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls }}'
                              }
                            }
                          ]
                        }
                      },
                      {
                        ref: 'check_tools',
                        type: 'conditional',
                        name: 'Check Tool Calls',
                        parameters: {
                          condition: '{{ $exists($lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls) ? "execute" : "done" }}'
                        }
                      },
                      {
                        ref: 'prepare_args',
                        type: 'code',
                        name: 'Prepare Tool Arguments',
                        parameters: {
                          code: \`
                            const toolCall = $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0];
                            return toolCall.function.arguments_json || JSON.parse(toolCall.function.arguments);
                          \`,
                          timeout: 2000
                        }
                      },
                      {
                        ref: 'tool_1',
                        type: 'tool',
                        name: 'Execute Tool',
                        parameters: {
                          name: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0].function.name }}',
                          description: 'Dynamic tool execution',
                          parameters: '{{ (() => { const tools = state.tools; const name = $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0].function.name; return tools.find(t => t.name === name)?.parameters || { type: "object", properties: {} }; })() }}',
                          blueprint: '{{ (() => { const tools = state.tools; const name = $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0].function.name; return tools.find(t => t.name === name)?.blueprint; })() }}',
                          mutations: [
                            {
                              operation: 'add',
                              path: '/state/messages/-',
                              value: {
                                role: 'tool',
                                toolCallId: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0].id }}',
                                name: '{{ $lastOutputOf("llm_1")[0].json.choices[0].message.toolCalls[0].function.name }}',
                                content: '{{ JSON.stringify($lastOutputOf("tool_1")[0].json) }}'
                              }
                            }
                          ]
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {}
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'llm_1' },
                      { ref: 'e2', from: 'llm_1', to: 'check_tools' },
                      { ref: 'e3', from: 'check_tools', to: 'prepare_args', condition: 'execute' },
                      { ref: 'e4', from: 'prepare_args', to: 'tool_1' },
                      { ref: 'e5', from: 'tool_1', to: 'llm_1' },
                      { ref: 'e6', from: 'check_tools', to: 'end_1', condition: 'done' }
                    ]
                  }
                }
              },
              state_management: {
                complex_transform: {
                  name: 'Complex State Transformation',
                  description: 'Multi-step data processing with state accumulation',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'init',
                        type: 'mutate',
                        name: 'Initialize State',
                        parameters: {
                          mutations: [
                            { operation: 'add', path: '/state/items', value: [] },
                            { operation: 'add', path: '/state/total', value: 0 },
                            { operation: 'add', path: '/state/metadata', value: { timestamp: '{{ $now() }}' } }
                          ]
                        }
                      },
                      {
                        ref: 'fetch_data',
                        type: 'http_request',
                        name: 'Fetch Items',
                        parameters: {
                          url: '{{ $input("apiUrl") }}/items',
                          method: 'GET'
                        }
                      },
                      {
                        ref: 'process_items',
                        type: 'code',
                        name: 'Process Items',
                        parameters: {
                          code: \`
                            const items = $lastOutputOf("fetch_data")[0].json.body;
                            const processed = items.map(item => ({
                              ...item,
                              processedAt: Date.now(),
                              score: item.value * 1.1
                            }));
                            const total = processed.reduce((sum, item) => sum + item.score, 0);
                            return { items: processed, total };
                          \`,
                          timeout: 5000
                        }
                      },
                      {
                        ref: 'update_state',
                        type: 'mutate',
                        name: 'Update State',
                        parameters: {
                          mutations: [
                            { operation: 'replace', path: '/state/items', value: '{{ $lastOutputOf("process_items")[0].json.items }}' },
                            { operation: 'replace', path: '/state/total', value: '{{ $lastOutputOf("process_items")[0].json.total }}' },
                            { operation: 'add', path: '/state/metadata/itemCount', value: '{{ $lastOutputOf("process_items")[0].json.items.length }}' }
                          ]
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {
                          output: '{{ state }}'
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'init' },
                      { ref: 'e2', from: 'init', to: 'fetch_data' },
                      { ref: 'e3', from: 'fetch_data', to: 'process_items' },
                      { ref: 'e4', from: 'process_items', to: 'update_state' },
                      { ref: 'e5', from: 'update_state', to: 'end_1' }
                    ]
                  }
                }
              },
              nested: {
                tool_with_nested_workflow: {
                  name: 'Tool with Nested Workflow',
                  description: 'Tool blueprint that contains a nested workflow',
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'validate_input',
                        type: 'code',
                        name: 'Validate Input',
                        parameters: {
                          code: \`
                            if (!input.query) throw new Error('Query is required');
                            if (!input.maxResults) input.maxResults = 10;
                            return input;
                          \`,
                          timeout: 1000
                        }
                      },
                      {
                        ref: 'search_workflow',
                        type: 'workflow',
                        name: 'Execute Search',
                        parameters: {
                          name: 'Search Workflow',
                          blueprint: {
                            nodes: [
                              { ref: 'sub_start', type: 'start', name: 'Start Search', parameters: {} },
                              {
                                ref: 'sub_api',
                                type: 'http_request',
                                name: 'Search API',
                                parameters: {
                                  url: 'https://api.search.com/query',
                                  method: 'POST',
                                  body: {
                                    q: '{{ $input("query") }}',
                                    limit: '{{ $input("maxResults") }}'
                                  }
                                }
                              },
                              {
                                ref: 'sub_filter',
                                type: 'code',
                                name: 'Filter Results',
                                parameters: {
                                  code: \`
                                    const results = $lastOutputOf("sub_api")[0].json.body.results;
                                    return results.filter(r => r.score > 0.5);
                                  \`
                                }
                              },
                              {
                                ref: 'sub_end',
                                type: 'end',
                                name: 'End Search',
                                parameters: {
                                  output: '{{ $lastOutputOf("sub_filter")[0].json }}'
                                }
                              }
                            ],
                            edges: [
                              { ref: 'se1', from: 'sub_start', to: 'sub_api' },
                              { ref: 'se2', from: 'sub_api', to: 'sub_filter' },
                              { ref: 'se3', from: 'sub_filter', to: 'sub_end' }
                            ]
                          }
                        }
                      },
                      {
                        ref: 'format_results',
                        type: 'transform',
                        name: 'Format Output',
                        parameters: {
                          transforms: [
                            {
                              operation: 'add',
                              path: '/formatted',
                              value: {
                                query: '{{ $lastOutputOf("validate_input")[0].json.query }}',
                                resultCount: '{{ $lastOutputOf("search_workflow")[0].json.length }}',
                                results: '{{ $lastOutputOf("search_workflow")[0].json }}'
                              }
                            }
                          ]
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {
                          output: '{{ $lastOutputOf("format_results")[0].json.formatted }}'
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'validate_input' },
                      { ref: 'e2', from: 'validate_input', to: 'search_workflow' },
                      { ref: 'e3', from: 'search_workflow', to: 'format_results' },
                      { ref: 'e4', from: 'format_results', to: 'end_1' }
                    ]
                  }
                }
              },
              error_handling: {
                resilient_workflow: {
                  name: 'Resilient Workflow with Error Handling',
                  description: 'Workflow that continues despite individual node failures',
                  engineConfig: {
                    failOnNodeError: false
                  },
                  blueprint: {
                    nodes: [
                      { ref: 'start_1', type: 'start', name: 'Start', parameters: {} },
                      {
                        ref: 'primary_api',
                        type: 'http_request',
                        name: 'Primary API',
                        parameters: {
                          url: '{{ $input("primaryUrl") }}',
                          method: 'GET',
                          timeout: 3000
                        }
                      },
                      {
                        ref: 'check_primary',
                        type: 'conditional',
                        name: 'Check Primary Success',
                        parameters: {
                          condition: '{{ $exists($lastOutputOf("primary_api")[0].error) ? "fallback" : "success" }}'
                        }
                      },
                      {
                        ref: 'fallback_api',
                        type: 'http_request',
                        name: 'Fallback API',
                        parameters: {
                          url: '{{ $input("fallbackUrl") }}',
                          method: 'GET',
                          timeout: 5000
                        }
                      },
                      {
                        ref: 'merge_results',
                        type: 'code',
                        name: 'Merge Results',
                        parameters: {
                          code: \`
                            const primary = $lastOutputOf("primary_api")[0];
                            const fallback = $lastOutputOf("fallback_api")[0];
                            
                            if (!primary.error) return { source: 'primary', data: primary.json };
                            if (!fallback.error) return { source: 'fallback', data: fallback.json };
                            return { source: 'none', error: 'Both APIs failed' };
                          \`
                        }
                      },
                      {
                        ref: 'end_1',
                        type: 'end',
                        name: 'End',
                        parameters: {
                          output: '{{ $lastOutputOf("merge_results")[0].json }}'
                        }
                      }
                    ],
                    edges: [
                      { ref: 'e1', from: 'start_1', to: 'primary_api' },
                      { ref: 'e2', from: 'primary_api', to: 'check_primary' },
                      { ref: 'e3', from: 'check_primary', to: 'fallback_api', condition: 'fallback' },
                      { ref: 'e4', from: 'check_primary', to: 'merge_results', condition: 'success' },
                      { ref: 'e5', from: 'fallback_api', to: 'merge_results' },
                      { ref: 'e6', from: 'merge_results', to: 'end_1' }
                    ]
                  }
                }
              }
            };
            
            // Helper to get all examples in a category
            const getCategoryExamples = (cat) => {
              const categoryExamples = examples[cat];
              if (!categoryExamples) return [];
              return Object.entries(categoryExamples).map(([key, value]) => ({
                id: key,
                ...value
              }));
            };
            
            // Build response
            if (category === 'all') {
              const allExamples = {};
              for (const [cat, catExamples] of Object.entries(examples)) {
                allExamples[cat] = getCategoryExamples(cat);
              }
              return {
                examples: allExamples,
                totalCategories: Object.keys(examples).length,
                totalExamples: Object.values(allExamples).reduce((sum, cat) => sum + cat.length, 0)
              };
            }
            
            const categoryExamples = examples[category];
            if (!categoryExamples) {
              return { error: \`Unknown category: \${category}\` };
            }
            
            if (pattern) {
              const example = categoryExamples[pattern];
              if (!example) {
                return { 
                  error: \`Pattern "\${pattern}" not found in category "\${category}"\`,
                  available: Object.keys(categoryExamples)
                };
              }
              return {
                category,
                pattern,
                example
              };
            }
            
            return {
              category,
              examples: getCategoryExamples(category),
              count: Object.keys(categoryExamples).length
            };
          `,
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ $lastOutputOf("fetch_examples")[0].json }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'fetch_examples' },
      { ref: 'e2', from: 'fetch_examples', to: 'end_1' },
    ],
    metadata: {},
  },
};

/**
 * Tool Template: blueprint_examples
 */
export const blueprintExamplesToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: blueprintExamplesTool.name,
  description: blueprintExamplesTool.description,
  parameters: blueprintExamplesTool.parameters,
  blueprint: blueprintExamplesTool.blueprint,

  slug: 'blueprint-examples',
  category: 'automation',
  exampleUsage: '{ "category": "llm_patterns" } // returns all LLM pattern examples',
  requiresApiKey: false,
  configurationFields: [],
};
