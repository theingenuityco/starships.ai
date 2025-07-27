/**
 * Combined MCP Tool Patterns
 * 
 * Demonstrates how to combine multiple MCP tools for complex agent tasks
 */

import { MCPToolGateway } from '@starships/core';
import { DynamicTool } from '@langchain/core/tools';
import { createMemoryTools } from './memory-integration-pattern';
import { createWebAutomationTools } from './web-automation-pattern';

/**
 * Create a comprehensive set of MCP tools for agents
 */
export function createCombinedMCPTools(
  gateway: MCPToolGateway,
  starshipId: string
): DynamicTool[] {
  const memoryTools = createMemoryTools(gateway, starshipId);
  const webTools = createWebAutomationTools(gateway, starshipId);
  
  // Additional combined pattern tools
  const combinedTools = [
    createResearchAndStoreTool(gateway, starshipId),
    createAnalyzeAndReasonTool(gateway, starshipId),
    createDocumentWorkflowTool(gateway, starshipId)
  ];
  
  return [...memoryTools, ...webTools, ...combinedTools];
}

/**
 * Research and Store Tool - Combines web automation with memory
 */
function createResearchAndStoreTool(
  gateway: MCPToolGateway,
  starshipId: string
): DynamicTool {
  return new DynamicTool({
    name: 'research_and_store',
    description: 'Research a topic online and store findings for future reference',
    func: async (input: string) => {
      try {
        const { topic, url, selectors } = JSON.parse(input);
        
        // Navigate and extract data
        const navigateResult = await gateway.invokeTool(starshipId, 'navigate', { url });
        if (!navigateResult.success) {
          return 'Failed to navigate to research URL';
        }
        
        // Extract content
        const extractScript = `
          const data = {};
          ${Object.entries(selectors).map(([key, selector]) => `
            const ${key}Element = document.querySelector('${selector}');
            data['${key}'] = ${key}Element ? ${key}Element.textContent.trim() : '';
          `).join('\n')}
          return data;
        `;
        
        const extractResult = await gateway.invokeTool(starshipId, 'evaluate', {
          script: extractScript
        });
        
        if (extractResult.success && extractResult.result) {
          // Store in memory
          const storeResult = await gateway.invokeTool(starshipId, 'store_memory', {
            key: `research:${topic}:${Date.now()}`,
            value: JSON.stringify({
              topic,
              url,
              data: extractResult.result,
              timestamp: new Date().toISOString()
            })
          });
          
          return storeResult.success 
            ? `Research completed and stored. Found: ${JSON.stringify(extractResult.result)}`
            : 'Research completed but failed to store results';
        }
        
        return 'Failed to extract research data';
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Invalid input format'}`;
      }
    }
  });
}

/**
 * Analyze and Reason Tool - Combines sequential thinking with memory
 */
function createAnalyzeAndReasonTool(
  gateway: MCPToolGateway,
  starshipId: string
): DynamicTool {
  return new DynamicTool({
    name: 'analyze_with_context',
    description: 'Analyze a problem using sequential thinking while leveraging stored context',
    func: async (input: string) => {
      try {
        const { problem, contextKeys = [], steps = 3 } = JSON.parse(input);
        
        // Retrieve relevant context
        const context: any[] = [];
        for (const key of contextKeys) {
          const result = await gateway.invokeTool(starshipId, 'retrieve_memory', { key });
          if (result.success && result.result) {
            context.push(result.result);
          }
        }
        
        // Use sequential thinking with context
        const thoughts: string[] = [];
        for (let i = 1; i <= steps; i++) {
          const thought = `Analyzing "${problem}" with context: ${JSON.stringify(context)}. Step ${i} of ${steps}.`;
          
          const thinkResult = await gateway.invokeTool(starshipId, 'sequentialthinking', {
            thought,
            thoughtNumber: i,
            totalThoughts: steps,
            nextThoughtNeeded: i < steps
          });
          
          if (thinkResult.success) {
            thoughts.push(thinkResult.result.thought || thinkResult.result);
          }
        }
        
        // Store the analysis
        await gateway.invokeTool(starshipId, 'store_memory', {
          key: `analysis:${problem.substring(0, 20)}:${Date.now()}`,
          value: JSON.stringify({
            problem,
            context,
            analysis: thoughts,
            timestamp: new Date().toISOString()
          })
        });
        
        return thoughts.join('\n\n');
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Invalid input format'}`;
      }
    }
  });
}

/**
 * Document Workflow Tool - Combines web automation, screenshots, and memory
 */
function createDocumentWorkflowTool(
  gateway: MCPToolGateway,
  starshipId: string
): DynamicTool {
  return new DynamicTool({
    name: 'document_workflow',
    description: 'Document a web workflow with screenshots and annotations',
    func: async (input: string) => {
      try {
        const { workflowName, steps } = JSON.parse(input);
        const documentation: any[] = [];
        
        for (const [index, step] of steps.entries()) {
          // Navigate to the page
          const navResult = await gateway.invokeTool(starshipId, 'navigate', {
            url: step.url
          });
          
          if (!navResult.success) {
            documentation.push({
              step: index + 1,
              description: step.description,
              status: 'failed',
              error: 'Navigation failed'
            });
            continue;
          }
          
          // Perform action if specified
          if (step.action) {
            const { type, selector, value } = step.action;
            
            if (type === 'click') {
              await gateway.invokeTool(starshipId, 'click', { selector });
            } else if (type === 'type') {
              await gateway.invokeTool(starshipId, 'type', { selector, text: value });
            }
          }
          
          // Take screenshot
          const screenshotPath = `/tmp/${workflowName}_step${index + 1}_${Date.now()}.png`;
          const screenshotResult = await gateway.invokeTool(starshipId, 'screenshot', {
            path: screenshotPath,
            fullPage: true
          });
          
          documentation.push({
            step: index + 1,
            description: step.description,
            url: step.url,
            action: step.action,
            screenshot: screenshotResult.success ? screenshotPath : null,
            timestamp: new Date().toISOString()
          });
        }
        
        // Store documentation
        const storeResult = await gateway.invokeTool(starshipId, 'store_memory', {
          key: `workflow:${workflowName}`,
          value: JSON.stringify({
            workflowName,
            documentation,
            createdAt: new Date().toISOString()
          })
        });
        
        return `Workflow documented: ${documentation.length} steps completed. ${
          storeResult.success ? 'Documentation stored successfully.' : 'Failed to store documentation.'
        }`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Invalid input format'}`;
      }
    }
  });
}