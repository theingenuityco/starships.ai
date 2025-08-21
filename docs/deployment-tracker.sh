#!/bin/bash

# DigitalOcean Deployment Progress Tracker Script
# Usage: ./deployment-tracker.sh [command]
# Commands: status, start, complete [task-id], reset, report

TRACKER_FILE=".deployment-progress.json"
LOG_FILE="deployment.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize tracker file if it doesn't exist
init_tracker() {
    if [ ! -f "$TRACKER_FILE" ]; then
        echo '{
  "start_time": "",
  "phases": {
    "preflight": {"status": "pending", "tasks": 6, "completed": 0},
    "account_setup": {"status": "pending", "tasks": 7, "completed": 0},
    "cluster_creation": {"status": "pending", "tasks": 5, "completed": 0},
    "app_deployment": {"status": "pending", "tasks": 10, "completed": 0},
    "verification": {"status": "pending", "tasks": 6, "completed": 0},
    "github_actions": {"status": "pending", "tasks": 5, "completed": 0},
    "production_setup": {"status": "pending", "tasks": 5, "completed": 0}
  },
  "tasks": {}
}' > "$TRACKER_FILE"
    fi
}

# Display progress bar
progress_bar() {
    local current=$1
    local total=$2
    local width=20
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    
    printf "["
    for ((i=0; i<filled; i++)); do printf "▓"; done
    for ((i=filled; i<width; i++)); do printf "░"; done
    printf "] %d%% (%d/%d)" $percentage $current $total
}

# Get overall progress
get_overall_progress() {
    local total_tasks=44
    local completed_tasks=$(jq '[.phases[].completed] | add' "$TRACKER_FILE")
    echo "$completed_tasks" "$total_tasks"
}

# Display status
show_status() {
    clear
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}     DigitalOcean Kubernetes Deployment Progress${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo
    
    # Overall progress
    read completed total <<< $(get_overall_progress)
    echo -e "${GREEN}Overall Progress:${NC} "
    progress_bar $completed $total
    echo -e "\n"
    
    # Phase status
    echo -e "${YELLOW}Phase Status:${NC}"
    echo "────────────────────────────────────────────────────"
    
    phases=("preflight:Pre-Flight Checks" "account_setup:Account Setup" "cluster_creation:Cluster Creation" 
            "app_deployment:Application Deployment" "verification:Verification" 
            "github_actions:GitHub Actions" "production_setup:Production Setup")
    
    for phase_info in "${phases[@]}"; do
        IFS=':' read -r phase_key phase_name <<< "$phase_info"
        phase_data=$(jq -r ".phases.$phase_key" "$TRACKER_FILE")
        status=$(echo "$phase_data" | jq -r '.status')
        completed=$(echo "$phase_data" | jq -r '.completed')
        total=$(echo "$phase_data" | jq -r '.tasks')
        
        # Status icon
        case $status in
            "completed") icon="✅" ;;
            "in_progress") icon="🔄" ;;
            "pending") icon="⏳" ;;
            *) icon="❌" ;;
        esac
        
        printf "%-25s %s " "$phase_name:" "$icon"
        progress_bar $completed $total
        echo
    done
    
    echo
    echo "────────────────────────────────────────────────────"
    
    # Current task
    current_task=$(jq -r '.current_task // "None"' "$TRACKER_FILE")
    if [ "$current_task" != "None" ]; then
        echo -e "${YELLOW}Current Task:${NC} $current_task"
    fi
    
    # Time tracking
    start_time=$(jq -r '.start_time' "$TRACKER_FILE")
    if [ "$start_time" != "" ] && [ "$start_time" != "null" ]; then
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        hours=$((elapsed / 3600))
        minutes=$(((elapsed % 3600) / 60))
        echo -e "${BLUE}Elapsed Time:${NC} ${hours}h ${minutes}m"
    fi
    
    echo
}

# Start deployment tracking
start_deployment() {
    init_tracker
    start_time=$(date +%s)
    jq ".start_time = $start_time" "$TRACKER_FILE" > tmp.json && mv tmp.json "$TRACKER_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Deployment started" >> "$LOG_FILE"
    echo -e "${GREEN}Deployment tracking started!${NC}"
    show_status
}

# Complete a task
complete_task() {
    local task_id=$1
    
    if [ -z "$task_id" ]; then
        echo -e "${RED}Error: Please provide a task ID${NC}"
        echo "Usage: $0 complete [task-id]"
        echo "Example: $0 complete D1-P1-01"
        return 1
    fi
    
    # Map task ID to phase
    phase=""
    case $task_id in
        PREP-*) phase="preflight" ;;
        D1-P1-*) phase="account_setup" ;;
        D1-P2-*) phase="cluster_creation" ;;
        D1-P3-*) phase="app_deployment" ;;
        D1-P4-*) phase="verification" ;;
        D2-P5-*) phase="github_actions" ;;
        D2-P6-*) phase="production_setup" ;;
        *) echo -e "${RED}Unknown task ID: $task_id${NC}"; return 1 ;;
    esac
    
    # Update phase progress
    current_completed=$(jq -r ".phases.$phase.completed" "$TRACKER_FILE")
    total_tasks=$(jq -r ".phases.$phase.tasks" "$TRACKER_FILE")
    new_completed=$((current_completed + 1))
    
    if [ $new_completed -le $total_tasks ]; then
        jq ".phases.$phase.completed = $new_completed" "$TRACKER_FILE" > tmp.json && mv tmp.json "$TRACKER_FILE"
        
        # Update phase status
        if [ $new_completed -eq $total_tasks ]; then
            jq ".phases.$phase.status = \"completed\"" "$TRACKER_FILE" > tmp.json && mv tmp.json "$TRACKER_FILE"
        else
            jq ".phases.$phase.status = \"in_progress\"" "$TRACKER_FILE" > tmp.json && mv tmp.json "$TRACKER_FILE"
        fi
        
        # Mark task as completed
        jq ".tasks.\"$task_id\" = {\"completed\": true, \"timestamp\": $(date +%s)}" "$TRACKER_FILE" > tmp.json && mv tmp.json "$TRACKER_FILE"
        
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Task $task_id completed" >> "$LOG_FILE"
        echo -e "${GREEN}✓ Task $task_id completed!${NC}"
        
        # Check if all tasks are completed
        read completed total <<< $(get_overall_progress)
        if [ $completed -eq $total ]; then
            echo -e "${GREEN}🎉 Congratulations! Deployment completed!${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: Phase $phase already completed${NC}"
    fi
    
    show_status
}

# Generate report
generate_report() {
    echo -e "${BLUE}Deployment Report${NC}"
    echo "=================="
    echo
    
    # Overall stats
    read completed total <<< $(get_overall_progress)
    percentage=$((completed * 100 / total))
    echo "Overall Completion: $percentage% ($completed/$total tasks)"
    
    # Time stats
    start_time=$(jq -r '.start_time' "$TRACKER_FILE")
    if [ "$start_time" != "" ] && [ "$start_time" != "null" ]; then
        current_time=$(date +%s)
        elapsed=$((current_time - start_time))
        hours=$((elapsed / 3600))
        minutes=$(((elapsed % 3600) / 60))
        echo "Total Time: ${hours}h ${minutes}m"
    fi
    
    echo
    echo "Phase Breakdown:"
    echo "----------------"
    
    phases=("preflight:Pre-Flight" "account_setup:Account Setup" "cluster_creation:Cluster" 
            "app_deployment:Deployment" "verification:Verification" 
            "github_actions:CI/CD" "production_setup:Production")
    
    for phase_info in "${phases[@]}"; do
        IFS=':' read -r phase_key phase_name <<< "$phase_info"
        phase_data=$(jq -r ".phases.$phase_key" "$TRACKER_FILE")
        completed=$(echo "$phase_data" | jq -r '.completed')
        total=$(echo "$phase_data" | jq -r '.tasks')
        percentage=$((completed * 100 / total))
        printf "%-20s: %3d%% (%d/%d)\n" "$phase_name" $percentage $completed $total
    done
    
    # Export to file
    report_file="deployment-report-$(date +%Y%m%d-%H%M%S).txt"
    {
        echo "DigitalOcean Deployment Report"
        echo "Generated: $(date)"
        echo "================================"
        echo
        cat "$LOG_FILE"
    } > "$report_file"
    
    echo
    echo -e "${GREEN}Report saved to: $report_file${NC}"
}

# Reset tracker
reset_tracker() {
    echo -e "${YELLOW}Are you sure you want to reset the tracker? (y/n)${NC}"
    read -r confirm
    if [ "$confirm" = "y" ]; then
        rm -f "$TRACKER_FILE"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Tracker reset" >> "$LOG_FILE"
        echo -e "${GREEN}Tracker reset successfully${NC}"
        init_tracker
    fi
}

# Main command handler
main() {
    init_tracker
    
    case "${1:-status}" in
        status)
            show_status
            ;;
        start)
            start_deployment
            ;;
        complete)
            complete_task "$2"
            ;;
        report)
            generate_report
            ;;
        reset)
            reset_tracker
            ;;
        help)
            echo "DigitalOcean Deployment Tracker"
            echo "Usage: $0 [command] [options]"
            echo
            echo "Commands:"
            echo "  status              Show current deployment status (default)"
            echo "  start               Start deployment tracking"
            echo "  complete [task-id]  Mark a task as completed"
            echo "  report              Generate deployment report"
            echo "  reset               Reset the tracker"
            echo "  help                Show this help message"
            echo
            echo "Task ID Examples:"
            echo "  PREP-01 to PREP-06       Pre-flight tasks"
            echo "  D1-P1-01 to D1-P1-07     Day 1 Phase 1 tasks"
            echo "  D1-P2-01 to D1-P2-05     Day 1 Phase 2 tasks"
            echo "  D1-P3-01 to D1-P3-10     Day 1 Phase 3 tasks"
            echo "  D1-P4-01 to D1-P4-06     Day 1 Phase 4 tasks"
            echo "  D2-P5-01 to D2-P5-05     Day 2 Phase 5 tasks"
            echo "  D2-P6-01 to D2-P6-05     Day 2 Phase 6 tasks"
            ;;
        *)
            echo -e "${RED}Unknown command: $1${NC}"
            echo "Use '$0 help' for usage information"
            ;;
    esac
}

# Check for jq dependency
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

main "$@"