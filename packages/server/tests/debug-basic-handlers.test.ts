/**
 * Debug Basic Handlers Test
 */

describe('Debug Basic Handlers', () => {
  test('should import basic handlers', () => {
    let error: any = null;
    try {
      const { StartNodeHandler, EndNodeHandler, OutputNodeHandler } = require('../src/services/BasicNodeHandlers');
      
      const startHandler = new StartNodeHandler();
      const endHandler = new EndNodeHandler();
      const outputHandler = new OutputNodeHandler();
      
      throw new Error(`Handlers loaded: start=${!!startHandler}, end=${!!endHandler}, output=${!!outputHandler}`);
    } catch (err) {
      error = err;
      throw new Error(`Import error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
});