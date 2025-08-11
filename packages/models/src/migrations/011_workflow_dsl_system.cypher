// Migration 011: Workflow DSL System - Create workflow nodes and relationships
// Creates the complete workflow DSL schema for expedition workflow management

// Create unique constraints for workflow entities
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;
CREATE CONSTRAINT workflow_node_id_unique IF NOT EXISTS FOR (wn:WorkflowNode) REQUIRE wn.id IS UNIQUE;
CREATE CONSTRAINT workflow_edge_id_unique IF NOT EXISTS FOR (we:WorkflowEdge) REQUIRE we.id IS UNIQUE;
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// Create indexes for performance
CREATE INDEX workflow_expedition_id_idx IF NOT EXISTS FOR (w:Workflow) ON (w.expeditionId);
CREATE INDEX workflow_approval_status_idx IF NOT EXISTS FOR (w:Workflow) ON (w.approvalStatus);
CREATE INDEX workflow_runtime_workflow_id_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.workflowId);
CREATE INDEX workflow_runtime_status_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.status);
CREATE INDEX workflow_node_type_idx IF NOT EXISTS FOR (wn:WorkflowNode) ON (wn.type);

// Add workflow_id property to existing Expedition nodes
MATCH (e:Expedition)
WHERE e.workflowId IS NULL
SET e.workflowId = null;

// Remove old workflowState property from expeditions (cleanup)
MATCH (e:Expedition)
WHERE e.workflowState IS NOT NULL
REMOVE e.workflowState;

RETURN "Workflow DSL schema created successfully" as result;