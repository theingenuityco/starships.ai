// Rollback Migration: Remove maxActiveMissions from Starship nodes
// This removes the maxActiveMissions property from Starship nodes

// Remove maxActiveMissions property from all Starships
MATCH (s:Starship)
WHERE s.maxActiveMissions IS NOT NULL
REMOVE s.maxActiveMissions;

// Return summary of updated starships
MATCH (s:Starship)
RETURN s.class, count(*) as count
ORDER BY s.class;