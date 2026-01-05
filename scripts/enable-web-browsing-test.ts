/**
 * Quick test script to enable web browsing for a single agent
 * 
 * Usage:
 *   npx tsx scripts/enable-web-browsing-test.ts <agent-slug>
 * 
 * Example:
 *   npx tsx scripts/enable-web-browsing-test.ts my-agent
 */

import { createConnection } from '@starships/models';

async function enableWebBrowsingForAgent(agentSlug: string) {
  const connection = createConnection();
  
  try {
    // Get the agent first
    const agent = await connection.queryOne<{ id: string; state: unknown }>(
      'SELECT id, state FROM agents WHERE slug = $1',
      [agentSlug]
    );

    if (!agent) {
      console.error(`❌ Agent with slug "${agentSlug}" not found`);
      process.exit(1);
    }

    console.log(`✅ Found agent: ${agentSlug} (ID: ${agent.id})`);

    // Parse existing state or create new
    const currentState = (agent.state && typeof agent.state === 'object') 
      ? (agent.state as Record<string, unknown>)
      : {};

    // Add plugins to state
    const updatedState = {
      ...currentState,
      plugins: [{ id: 'web', max_results: 3 }],
    };

    // Update the agent
    await connection.query(
      `UPDATE agents 
       SET state = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(updatedState), agent.id]
    );

    console.log(`✅ Web browsing enabled for agent "${agentSlug}"`);
    console.log(`   Plugins: ${JSON.stringify(updatedState.plugins)}`);
    console.log(`\n💡 Test it by asking the agent a question that requires current information!`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await connection.close();
  }
}

// Get agent slug from command line
const agentSlug = process.argv[2];

if (!agentSlug) {
  console.error('Usage: npx tsx scripts/enable-web-browsing-test.ts <agent-slug>');
  console.error('Example: npx tsx scripts/enable-web-browsing-test.ts my-agent');
  process.exit(1);
}

enableWebBrowsingForAgent(agentSlug);

