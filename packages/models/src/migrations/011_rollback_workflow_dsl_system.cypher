// Rollback Migration 011: Workflow DSL System - Remove workflow schema
// Removes all workflow DSL schema changes

// Drop workflow data first
MATCH (wrs:WorkflowRuntimeState) DETACH DELETE wrs;
MATCH (we:WorkflowEdge) DETACH DELETE we;
MATCH (wn:WorkflowNode) DETACH DELETE wn;
MATCH (w:Workflow) DETACH DELETE w;

// Drop indexes
// Note: expedition index was not created, so no need to drop
// DROP INDEX workflow_expedition_id_idx IF EXISTS;
DROP INDEX workflow_approval_status_idx IF EXISTS;
DROP INDEX workflow_runtime_workflow_id_idx IF EXISTS;
DROP INDEX workflow_runtime_status_idx IF EXISTS;
DROP INDEX workflow_node_type_idx IF EXISTS;

// Drop constraints
DROP CONSTRAINT workflow_id_unique IF EXISTS;
DROP CONSTRAINT workflow_node_id_unique IF EXISTS;
DROP CONSTRAINT workflow_edge_id_unique IF EXISTS;
DROP CONSTRAINT workflow_runtime_state_id_unique IF EXISTS;

// Note: Expedition-related workflow cleanup skipped as Expedition nodes may not exist
// The workflow rollback operates independently

RETURN "Workflow DSL schema rollback completed" as result;