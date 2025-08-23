#!/bin/bash

echo "Testing Java setup for Neo4j..."

# Create a test directory
TEST_DIR="/tmp/neo4j-java-test"
rm -rf $TEST_DIR
mkdir -p $TEST_DIR
cd $TEST_DIR

# Download Neo4j 5.13.0 to test
echo "Downloading Neo4j 5.13.0..."
curl -L -o neo4j.tar.gz "https://dist.neo4j.com/neo4j-community-5.13.0-unix.tar.gz"
tar -xzf neo4j.tar.gz
cd neo4j-community-5.13.0

# Check what Java version Neo4j requires
echo "Checking Neo4j Java requirements..."
./bin/neo4j version

# Clean up
cd /
rm -rf $TEST_DIR