/**
 * Render Starship Details Tool Tests
 */

import { renderStarshipDetailsTool, renderStarshipDetailsToolTemplate } from '../render-starship-details';
import { ToolTestHelper } from './tool-test-helper';

describe('Render Starship Details Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(renderStarshipDetailsTool, renderStarshipDetailsToolTemplate, 'render-starship-details');
    testHelper.clearEventLogs();
  });

  it('should have valid structure', () => {
    const result = testHelper.testToolStructure();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should have valid parameters schema', () => {
    const result = testHelper.testParameterSchema();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should have a connected blueprint', () => {
    const result = testHelper.testBlueprintStructure();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should have consistent template configuration', () => {
    const result = testHelper.testTemplateConsistency();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

