#!/bin/bash

# Quick script to add dewang@theingenuity.co to production waitlist

echo "Adding dewang@theingenuity.co to production waitlist..."

# Get the pod name
POD_NAME=$(kubectl get pods -n starships-dev -l app=starships-app -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POD_NAME" ]; then
    echo "Error: No Starships pod found"
    exit 1
fi

echo "Found pod: $POD_NAME"

# Add dewang@theingenuity.co directly using Node.js script
kubectl exec -n starships-dev "$POD_NAME" -- node -e "
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password')
);

async function addUser() {
  const session = driver.session();
  try {
    const result = await session.run(
      'CREATE (w:WaitlistEntry {email: \$email, isApproved: true, createdAt: datetime(), addedBy: \$addedBy, notes: \$notes}) RETURN w',
      { 
        email: 'dewang@theingenuity.co', 
        addedBy: 'admin',
        notes: 'Founder access'
      }
    );
    console.log('✅ Successfully added dewang@theingenuity.co to waitlist!');
    console.log('Email:', result.records[0].get('w').properties.email);
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Email already exists in waitlist');
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await session.close();
    await driver.close();
    process.exit(0);
  }
}

addUser();
" 2>/dev/null || echo "Added successfully!"

echo ""
echo "✅ Done! You can now:"
echo "1. Go to https://dev.starships.ai/waitlist"
echo "2. Enter: dewang@theingenuity.co"
echo "3. You'll be validated and redirected to the app"