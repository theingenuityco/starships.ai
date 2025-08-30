/**
 * PromptHandler Unit Tests
 */

import { PromptHandler } from '../PromptHandler';
import { Node, ExecutionContext, UserPromptNodeParameters, UserPromptChoice } from '../../../types';

describe('PromptHandler', () => {
  let handler: PromptHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    const mockChoices: UserPromptChoice[] = [
      { id: 'choice1', text: 'Option 1', description: 'First option', value: 'value1' },
      { id: 'choice2', text: 'Option 2', description: 'Second option', value: 'value2' },
      { id: 'choice3', text: 'Option 3', value: 'value3' }
    ];

    mockNode = {
      id: 'prompt-node',
      type: 'user_prompt',
      name: 'Test Prompt Node',
      description: 'User prompt node for testing',
      parameters: {
        promptText: 'Please select an option:',
        choices: mockChoices,
        sourceNodeId: 'source-node',
        timeout: 60000,
        required: true
      } as UserPromptNodeParameters
    };
    
    handler = new PromptHandler(mockNode);
    mockContext = global.createMockContext();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('user_prompt');
    });
  });

  describe('execute', () => {
    it('should execute successfully with valid parameters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await handler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('prompt-node');
      expect(result.data).toEqual({
        choice: (mockNode.parameters as UserPromptNodeParameters).choices[0],
        userInput: 'placeholder'
      });
      expect(result.duration).toBe(100);
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
      
      // Verify console.log was called with correct parameters
      expect(consoleSpy).toHaveBeenCalledWith('User prompt: Please select an option:');
      expect(consoleSpy).toHaveBeenCalledWith('Choices:', (mockNode.parameters as UserPromptNodeParameters).choices);
      
      consoleSpy.mockRestore();
    });

    it('should execute with minimal parameters', async () => {
      const minimalParams = {
        promptText: 'Simple prompt',
        choices: [{ id: 'yes', text: 'Yes', value: true }]
      } as UserPromptNodeParameters;
      
      const minimalNode: Node = {
        id: 'minimal-node',
        type: 'user_prompt',
        name: 'Minimal Prompt',
        description: 'Minimal prompt for testing',
        parameters: minimalParams
      };
      const minimalHandler = new PromptHandler(minimalNode);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await minimalHandler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        choice: { id: 'yes', text: 'Yes', value: true },
        userInput: 'placeholder'
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('User prompt: Simple prompt');
      
      consoleSpy.mockRestore();
    });

    it('should handle multiple choice types', async () => {
      const complexChoices: UserPromptChoice[] = [
        { id: 'str', text: 'String Choice', value: 'string_value' },
        { id: 'num', text: 'Number Choice', value: 42 },
        { id: 'bool', text: 'Boolean Choice', value: true },
        { id: 'obj', text: 'Object Choice', value: { key: 'value' } },
        { id: 'arr', text: 'Array Choice', value: [1, 2, 3] }
      ];

      const complexParams = {
        promptText: 'Choose a complex option:',
        choices: complexChoices
      } as UserPromptNodeParameters;
      
      const complexNode: Node = {
        id: 'complex-node',
        type: 'user_prompt',
        name: 'Complex Prompt',
        description: 'Complex prompt for testing',
        parameters: complexParams
      };
      const complexHandler = new PromptHandler(complexNode);
      
      const result = await complexHandler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        choice: complexChoices[0], // Returns first choice as placeholder
        userInput: 'placeholder'
      });
    });

    it('should handle empty choices array gracefully', async () => {
      const emptyChoicesParams = {
        promptText: 'No choices available',
        choices: []
      } as UserPromptNodeParameters;
      
      const emptyChoicesNode: Node = {
        id: 'empty-choices-node',
        type: 'user_prompt',
        name: 'Empty Choices Prompt',
        description: 'Empty choices prompt for testing',
        parameters: emptyChoicesParams
      };
      const emptyChoicesHandler = new PromptHandler(emptyChoicesNode);
      
      const result = await emptyChoicesHandler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        choice: undefined, // No choices available
        userInput: 'placeholder'
      });
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockContext);
      const afterExecution = Date.now();
      
      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });

    it('should work with empty context', async () => {
      const emptyContext = {} as ExecutionContext;
      
      const result = await handler.execute(emptyContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('prompt-node');
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate successfully with minimal valid parameters', () => {
      const minimalParams = {
        promptText: 'Simple prompt',
        choices: [{ id: 'ok', text: 'OK', value: 'ok' }]
      } as UserPromptNodeParameters;
      
      const minimalNode: Node = {
        id: 'minimal-node',
        type: 'user_prompt',
        name: 'Minimal Prompt',
        description: 'Minimal prompt for testing',
        parameters: minimalParams
      };
      const minimalHandler = new PromptHandler(minimalNode);
      const result = minimalHandler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when promptText is missing', () => {
      const paramsWithoutPrompt = {
        choices: [{ id: 'yes', text: 'Yes', value: true }]
      } as UserPromptNodeParameters;
      
      const nodeWithoutPrompt: Node = {
        id: 'no-prompt-node',
        type: 'user_prompt',
        name: 'Prompt without prompt text',
        description: 'Prompt without prompt text for testing',
        parameters: paramsWithoutPrompt
      };
      const handlerWithoutPrompt = new PromptHandler(nodeWithoutPrompt);
      const result = handlerWithoutPrompt.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Prompt text is required',
        nodeId: 'no-prompt-node',
        severity: 'error'
      });
    });

    it('should fail validation when promptText is empty string', () => {
      const paramsWithEmptyPrompt = {
        promptText: '',
        choices: [{ id: 'yes', text: 'Yes', value: true }]
      } as UserPromptNodeParameters;
      
      const nodeWithEmptyPrompt: Node = {
        id: 'empty-prompt-node',
        type: 'user_prompt',
        name: 'Prompt with empty text',
        description: 'Prompt with empty text for testing',
        parameters: paramsWithEmptyPrompt
      };
      const handlerWithEmptyPrompt = new PromptHandler(nodeWithEmptyPrompt);
      const result = handlerWithEmptyPrompt.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Prompt text is required');
    });

    it('should fail validation when choices are missing', () => {
      const paramsWithoutChoices = {
        promptText: 'Select something'
      } as UserPromptNodeParameters;
      
      const nodeWithoutChoices: Node = {
        id: 'no-choices-node',
        type: 'user_prompt',
        name: 'Prompt without choices',
        description: 'Prompt without choices for testing',
        parameters: paramsWithoutChoices
      };
      const handlerWithoutChoices = new PromptHandler(nodeWithoutChoices);
      const result = handlerWithoutChoices.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one choice is required',
        nodeId: 'no-choices-node',
        severity: 'error'
      });
    });

    it('should fail validation when choices array is empty', () => {
      const paramsWithEmptyChoices = {
        promptText: 'Select something',
        choices: []
      } as UserPromptNodeParameters;
      
      const nodeWithEmptyChoices: Node = {
        id: 'empty-choices-node',
        type: 'user_prompt',
        name: 'Prompt with empty choices',
        description: 'Prompt with empty choices for testing',
        parameters: paramsWithEmptyChoices
      };
      const handlerWithEmptyChoices = new PromptHandler(nodeWithEmptyChoices);
      const result = handlerWithEmptyChoices.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('At least one choice is required');
    });

    it('should fail validation for both missing promptText and choices', () => {
      const paramsWithMissingFields = {
        timeout: 30000
      } as UserPromptNodeParameters;
      
      const nodeWithMissingFields: Node = {
        id: 'missing-fields-node',
        type: 'user_prompt',
        name: 'Prompt with missing fields',
        description: 'Prompt with missing fields for testing',
        parameters: paramsWithMissingFields
      };
      const handlerWithMissingFields = new PromptHandler(nodeWithMissingFields);
      const result = handlerWithMissingFields.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain('MISSING_REQUIRED_FIELD');
      
      const errorMessages = result.errors.map(e => e.message);
      expect(errorMessages).toContain('Prompt text is required');
      expect(errorMessages).toContain('At least one choice is required');
    });

    it('should validate choices with different value types', () => {
      const paramsWithVariedChoices = {
        promptText: 'Choose wisely',
        choices: [
          { id: 'str', text: 'String', value: 'text' },
          { id: 'num', text: 'Number', value: 123 },
          { id: 'bool', text: 'Boolean', value: false },
          { id: 'null', text: 'Null', value: null },
          { id: 'undef', text: 'Undefined', value: undefined },
          { id: 'obj', text: 'Object', value: { nested: true } }
        ]
      } as UserPromptNodeParameters;
      
      const nodeWithVariedChoices: Node = {
        id: 'varied-choices-node',
        type: 'user_prompt',
        name: 'Prompt with varied choices',
        description: 'Prompt with varied choices for testing',
        parameters: paramsWithVariedChoices
      };
      const handlerWithVariedChoices = new PromptHandler(nodeWithVariedChoices);
      const result = handlerWithVariedChoices.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('message-circle');
    });
  });
});