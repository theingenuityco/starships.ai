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
    
    handler = new PromptHandler(mockNode.parameters, mockNode.id);
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
      
      const minimalHandler = new PromptHandler(minimalParams, 'minimal-node');
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
      
      const complexHandler = new PromptHandler(complexParams, 'complex-node');
      
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
      
      const emptyChoicesHandler = new PromptHandler(emptyChoicesParams, 'empty-choices-node');
      
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
      
      const minimalHandler = new PromptHandler(minimalParams, 'minimal-node');
      const result = minimalHandler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when promptText is missing', () => {
      const paramsWithoutPrompt = {
        choices: [{ id: 'yes', text: 'Yes', value: true }]
      } as UserPromptNodeParameters;
      
      const handlerWithoutPrompt = new PromptHandler(paramsWithoutPrompt, 'no-prompt-node');
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
      
      const handlerWithEmptyPrompt = new PromptHandler(paramsWithEmptyPrompt, 'empty-prompt-node');
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
      
      const handlerWithoutChoices = new PromptHandler(paramsWithoutChoices, 'no-choices-node');
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
      
      const handlerWithEmptyChoices = new PromptHandler(paramsWithEmptyChoices, 'empty-choices-node');
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
      
      const handlerWithMissingFields = new PromptHandler(paramsWithMissingFields, 'missing-fields-node');
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
      
      const handlerWithVariedChoices = new PromptHandler(paramsWithVariedChoices, 'varied-choices-node');
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