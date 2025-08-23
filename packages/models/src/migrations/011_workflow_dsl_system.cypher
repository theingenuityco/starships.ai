// Migration 011: Workflow DSL System - Create workflow nodes and relationships
// Creates the complete workflow DSL schema for expedition workflow management

// Create unique constraints for workflow entities
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;
CREATE CONSTRAINT workflow_node_id_unique IF NOT EXISTS FOR (wn:WorkflowNode) REQUIRE wn.id IS UNIQUE;
CREATE CONSTRAINT workflow_edge_id_unique IF NOT EXISTS FOR (we:WorkflowEdge) REQUIRE we.id IS UNIQUE;
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// Create indexes for performance
// Note: expedition index skipped as Expedition nodes may not exist
// CREATE INDEX workflow_expedition_id_idx IF NOT EXISTS FOR (w:Workflow) ON (w.expeditionId);
CREATE INDEX workflow_approval_status_idx IF NOT EXISTS FOR (w:Workflow) ON (w.approvalStatus);
CREATE INDEX workflow_runtime_workflow_id_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.workflowId);
CREATE INDEX workflow_runtime_status_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.status);
CREATE INDEX workflow_node_type_idx IF NOT EXISTS FOR (wn:WorkflowNode) ON (wn.type);

// Note: Expedition-related workflow operations skipped as Expedition nodes may not exist
// The workflow system can operate independently without Expedition integration

RETURN "Workflow DSL schema created successfully" as result;