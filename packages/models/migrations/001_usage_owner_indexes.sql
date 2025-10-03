-- Usage/Starships supporting indexes for owner-scoped queries
-- Safe to re-run; IF NOT EXISTS guards

-- Filter starships by owner quickly
CREATE INDEX IF NOT EXISTS idx_starships_owner_id ON starships(owner_id);

-- Join/filter usage by starship
CREATE INDEX IF NOT EXISTS idx_usage_starship_id ON usage(starship_id);

-- Support ORDER BY created_at in listByUser queries
CREATE INDEX IF NOT EXISTS idx_usage_starship_created_at ON usage(starship_id, created_at);

-- Support filtering/grouping by model in list/count daily-model queries
CREATE INDEX IF NOT EXISTS idx_usage_starship_model ON usage(starship_id, model);
