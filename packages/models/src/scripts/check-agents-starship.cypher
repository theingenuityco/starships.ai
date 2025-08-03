// Check all agents and their starship assignments
MATCH (a:Agent)
OPTIONAL MATCH (a)-[:DEPLOYED_ON]->(s:Starship)
OPTIONAL MATCH (s)-[:HAS_VISION]->(v:Vision)
RETURN 
  a.id AS agentId,
  a.name AS agentName,
  a.status AS agentStatus,
  a.starshipId AS agentStarshipId,
  s.id AS connectedStarshipId,
  s.name AS starshipName,
  v.statement AS visionStatement,
  CASE 
    WHEN a.starshipId IS NULL THEN '❌ NO STARSHIP ID'
    WHEN s IS NULL THEN '⚠️  STARSHIP NOT FOUND'
    WHEN v IS NULL THEN '⚠️  NO VISION'
    WHEN v.statement IS NULL OR trim(v.statement) = '' THEN '⚠️  EMPTY VISION'
    ELSE '✅ OK'
  END AS status
ORDER BY a.name;