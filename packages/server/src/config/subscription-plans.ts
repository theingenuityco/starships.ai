export const SUBSCRIPTION_PLANS = {
  scout: {
    product: {
      name: "Scout Plan",
      description: "Perfect for getting started with Starships.ai",
      metadata: {
        agents: "3",
        first_officer: "true",
        mcps: "2", 
        expeditions_parallel: "1",
        artifact_storage_gb: "5",
        token_rate_limit: "20000",
        plan_type: "scout"
      }
    },
    prices: {
      monthly: { amount: 0, interval: "month" },
      yearly: { amount: 0, interval: "year" }
    }
  },
  cruiser: {
    product: {
      name: "Cruiser Plan", 
      description: "Advanced features for power users",
      metadata: {
        agents: "5",
        first_officer: "true", 
        mcps: "4",
        expeditions_parallel: "3",
        artifact_storage_gb: "20",
        token_rate_limit: "80000",
        plan_type: "cruiser"
      }
    },
    prices: {
      monthly: { amount: 3000, interval: "month" }, // $30 in cents
      yearly: { amount: 36000, interval: "year" }   // $360 in cents
    }
  }
};