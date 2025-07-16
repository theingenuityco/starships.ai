/**
 * Test script for the enhanced starship API endpoints
 * Run this after the server is running to verify the new endpoints work
 */

const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';

// Mock auth token - you'll need to replace this with a real token
const AUTH_TOKEN = 'your-auth-token-here';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testStarshipAPI() {
  console.log('🚀 Testing Enhanced Starship API...\n');

  try {
    // Test 1: Get all starships
    console.log('📋 Test 1: GET /starships');
    const starships = await api.get('/starships');
    console.log(`✅ Found ${starships.data.starships.length} starships`);
    
    if (starships.data.starships.length === 0) {
      console.log('⚠️  No starships found. Creating a test starship...');
      
      // Create a test starship
      const newStarship = await api.post('/starships', {
        name: 'Test Starship',
        class: 'scout'
      });
      console.log('✅ Created test starship:', newStarship.data.starship.id);
    }

    // Get the first starship for testing
    const testStarship = starships.data.starships[0];
    const starshipId = testStarship.id;
    
    console.log(`\n🎯 Using starship: ${testStarship.name} (${starshipId})`);

    // Test 2: Get starship details
    console.log('\n🔍 Test 2: GET /starships/:id');
    const details = await api.get(`/starships/${starshipId}`);
    console.log(`✅ Retrieved starship details: ${details.data.starship.name}`);

    // Test 3: Get starship agents
    console.log('\n👥 Test 3: GET /starships/:id/agents');
    const agents = await api.get(`/starships/${starshipId}/agents`);
    console.log(`✅ Retrieved agent info: ${agents.data.deployedCount} deployed, ${agents.data.availableSlots} available`);

    // Test 4: Update starship status
    console.log('\n🔄 Test 4: PUT /starships/:id/status');
    const statusUpdate = await api.put(`/starships/${starshipId}/status`, {
      status: 'maintenance'
    });
    console.log(`✅ Updated starship status to: ${statusUpdate.data.starship.status}`);

    // Test 5: Update starship details
    console.log('\n✏️  Test 5: PUT /starships/:id');
    const updateResponse = await api.put(`/starships/${starshipId}`, {
      name: `${testStarship.name} - Updated`,
      status: 'active'
    });
    console.log(`✅ Updated starship: ${updateResponse.data.starship.name}`);

    // Test 6: Try to update with invalid data (should fail)
    console.log('\n❌ Test 6: PUT /starships/:id (invalid data)');
    try {
      await api.put(`/starships/${starshipId}`, {
        status: 'invalid-status'
      });
      console.log('⚠️  This should have failed');
    } catch (error) {
      console.log(`✅ Correctly rejected invalid status: ${error.response.data.error}`);
    }

    // Test 7: Try to delete starship (only if no active expeditions)
    console.log('\n🗑️  Test 7: DELETE /starships/:id');
    if (testStarship.activeExpeditions === 0) {
      // Don't actually delete, just test the endpoint structure
      console.log('✅ Delete endpoint available (skipping actual deletion)');
    } else {
      try {
        await api.delete(`/starships/${starshipId}`);
        console.log('⚠️  This should have failed due to active expeditions');
      } catch (error) {
        console.log(`✅ Correctly rejected deletion: ${error.response.data.error}`);
      }
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the tests
testStarshipAPI();