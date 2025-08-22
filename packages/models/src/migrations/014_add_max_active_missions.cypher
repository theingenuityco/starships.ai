// Migration: Add maxActiveMissions to Starship nodes
// This adds the maxActiveMissions property to existing Starship nodes based on their class

// Add maxActiveMissions property to existing Starships based on class
MATCH (s:Starship)
WHERE s.maxActiveMissions IS NULL
SET s.maxActiveMissions = CASE s.class
  WHEN 'scout' THEN 3
  WHEN 'cruiser' THEN 6
  WHEN 'draught' THEN 10
  ELSE 3  // Default to scout limits for any unknown class
END;

// Return summary of updated starships
MATCH (s:Starship)
RETURN s.class, s.maxActiveMissions, count(*) as count
ORDER BY s.class;