/**
 * Example usage of the Tool Form Drawer
 *
 * This file demonstrates how Daedalus or other agents can interact with the tool form drawer
 * to help users create custom tools through conversation.
 */

import { openToolFormDrawer, populateToolForm, openAndPopulateToolForm, getToolFormController } from '@/lib/tool-form-controller'

/**
 * Example 1: Simple Weather Tool
 * Opens the drawer and pre-fills a basic weather lookup tool
 */
export function createWeatherTool() {
  openAndPopulateToolForm({
    name: 'Weather Lookup',
    description: 'Fetches current weather data for any city using OpenWeather API',
    category: 'data',
    exampleUsage: 'getWeather({ city: "San Francisco" }) returns current temperature and conditions',
    requiresApiKey: true,
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Name of the city to get weather for',
        },
        units: {
          type: 'string',
          description: 'Temperature units',
          enum: ['metric', 'imperial'],
        },
      },
      required: ['city'],
    },
    blueprint: {
      nodes: [
        { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'fetch-weather',
          type: 'HttpRequest',
          position: { x: 200, y: 0 },
          parameters: {
            url: 'https://api.openweathermap.org/data/2.5/weather?q={{ input.city }}&units={{ input.units || "metric" }}&appid={{ config.openWeatherApiKey }}',
            method: 'GET',
          },
        },
        { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: { output: '{{ fetch-weather.output }}' } },
      ],
      edges: [
        { source: 'start', target: 'fetch-weather' },
        { source: 'fetch-weather', target: 'end' },
      ],
    },
  })
}

/**
 * Example 2: GitHub Issue Creator
 * Shows more complex tool with authentication
 */
export function createGitHubIssueTool() {
  openAndPopulateToolForm({
    name: 'GitHub Issue Creator',
    description: 'Creates a new issue in a specified GitHub repository',
    category: 'automation',
    exampleUsage: 'createIssue({ repo: "owner/repo", title: "Bug found", body: "Description here" })',
    requiresApiKey: true,
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'Repository in format owner/repo',
        },
        title: {
          type: 'string',
          description: 'Issue title',
        },
        body: {
          type: 'string',
          description: 'Issue description',
        },
        labels: {
          type: 'array',
          description: 'Array of label names to add',
          items: { type: 'string' },
        },
      },
      required: ['repo', 'title'],
    },
    blueprint: {
      nodes: [
        { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'create-issue',
          type: 'HttpRequest',
          position: { x: 200, y: 0 },
          parameters: {
            url: 'https://api.github.com/repos/{{ input.repo }}/issues',
            method: 'POST',
            headers: {
              Authorization: 'Bearer {{ config.githubToken }}',
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: {
              title: '{{ input.title }}',
              body: '{{ input.body }}',
              labels: '{{ input.labels }}',
            },
          },
        },
        { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: { output: '{{ create-issue.output }}' } },
      ],
      edges: [
        { source: 'start', target: 'create-issue' },
        { source: 'create-issue', target: 'end' },
      ],
    },
  })
}

/**
 * Example 3: Incremental Form Filling
 * Shows how to update the form field by field, as in a conversation with Daedalus
 */
export function incrementalToolCreation() {
  // Step 1: Open the drawer
  openToolFormDrawer()

  // Step 2: Set basic info
  const controller = getToolFormController()
  if (!controller) return

  controller.updateField('name', 'Email Sender')
  controller.updateField('description', 'Sends emails using SendGrid API')
  controller.updateField('category', 'communication')

  // Step 3: User might ask to change something
  setTimeout(() => {
    controller.updateField('description', 'Sends transactional emails using SendGrid API with template support')
  }, 2000)

  // Step 4: Fill in technical details
  setTimeout(() => {
    controller.updateField('requiresApiKey', true)
    controller.updateField('exampleUsage', 'sendEmail({ to: "user@example.com", subject: "Hello", body: "Message" })')

    const params = {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body content' },
        templateId: { type: 'string', description: 'Optional SendGrid template ID' },
      },
      required: ['to', 'subject', 'body'],
    }
    controller.updateField('parameters', JSON.stringify(params, null, 2))

    const blueprint = {
      nodes: [
        { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'send-email',
          type: 'HttpRequest',
          position: { x: 200, y: 0 },
          parameters: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              Authorization: 'Bearer {{ config.sendgridApiKey }}',
              'Content-Type': 'application/json',
            },
            body: {
              personalizations: [
                {
                  to: [{ email: '{{ input.to }}' }],
                  subject: '{{ input.subject }}',
                },
              ],
              from: { email: '{{ config.fromEmail }}' },
              content: [{ type: 'text/plain', value: '{{ input.body }}' }],
            },
          },
        },
        { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: { output: '{{ send-email.output }}' } },
      ],
      edges: [
        { source: 'start', target: 'send-email' },
        { source: 'send-email', target: 'end' },
      ],
    }
    controller.updateField('blueprint', JSON.stringify(blueprint, null, 2))
  }, 4000)
}

/**
 * Example 4: Data Processing Tool
 * Shows a tool for data transformation
 */
export function createDataProcessorTool() {
  openAndPopulateToolForm({
    name: 'JSON Transformer',
    description: 'Transforms JSON data using JQ-like expressions',
    category: 'data',
    exampleUsage: 'transform({ data: {...}, expression: ".users[] | {name, email}" })',
    requiresApiKey: false,
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'Input JSON data to transform',
        },
        expression: {
          type: 'string',
          description: 'Transformation expression',
        },
      },
      required: ['data', 'expression'],
    },
    blueprint: {
      nodes: [
        { id: 'start', type: 'Start', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'transform',
          type: 'Code',
          position: { x: 200, y: 0 },
          parameters: {
            code: `
              // Simple transformation logic
              const { data, expression } = input;
              // In a real implementation, this would use a JQ library
              return { transformed: data };
            `,
          },
        },
        { id: 'end', type: 'End', position: { x: 400, y: 0 }, parameters: { output: '{{ transform.output }}' } },
      ],
      edges: [
        { source: 'start', target: 'transform' },
        { source: 'transform', target: 'end' },
      ],
    },
  })
}

// Export all examples for easy testing
export const toolExamples = {
  weather: createWeatherTool,
  githubIssue: createGitHubIssueTool,
  incremental: incrementalToolCreation,
  dataProcessor: createDataProcessorTool,
}
