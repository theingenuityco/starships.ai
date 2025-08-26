#!/bin/bash

# Script to manage Starships.ai waitlist users in production
# Usage: 
#   ./manage-waitlist.sh add <email> [notes]
#   ./manage-waitlist.sh add-bulk <file.txt>
#   ./manage-waitlist.sh list
#   ./manage-waitlist.sh check <email>

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="starships-dev"  # Change to starships-prod for production
CONTEXT="do-nyc1-starships-dev"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Function to get pod name
get_pod_name() {
    kubectl get pods -n "$NAMESPACE" -l app=starships-app -o jsonpath='{.items[0].metadata.name}' 2>/dev/null
}

# Function to check kubectl context
check_context() {
    CURRENT_CONTEXT=$(kubectl config current-context)
    if [ "$CURRENT_CONTEXT" != "$CONTEXT" ]; then
        print_warning "Current context is $CURRENT_CONTEXT, switching to $CONTEXT"
        kubectl config use-context "$CONTEXT"
    fi
}

# Function to validate email
validate_email() {
    if ! [[ "$1" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        return 1
    fi
    return 0
}

# Function to add single user
add_user() {
    local EMAIL="$1"
    local NOTES="${2:-Added via script}"
    local ADDED_BY="${USER:-admin}"
    
    if ! validate_email "$EMAIL"; then
        print_error "Invalid email format: $EMAIL"
        return 1
    fi
    
    POD_NAME=$(get_pod_name)
    if [ -z "$POD_NAME" ]; then
        print_error "No Starships pod found in namespace $NAMESPACE"
        return 1
    fi
    
    print_info "Adding $EMAIL to waitlist..."
    
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- node -e "
    const neo4j = require('neo4j-driver');
    
    const driver = neo4j.driver(
      '[NEO4J-LOCAL-URL]',
      neo4j.auth.basic('neo4j', '[DEFAULT-PASSWORD]')
    );
    
    async function addUser() {
      const session = driver.session();
      try {
        // First check if user exists
        const checkResult = await session.run(
          'MATCH (w:WaitlistEntry {email: \$email}) RETURN w',
          { email: '${EMAIL}' }
        );
        
        if (checkResult.records.length > 0) {
          console.log('⚠️  User already exists: ${EMAIL}');
          const existing = checkResult.records[0].get('w').properties;
          console.log('   Status: ' + (existing.isApproved ? 'APPROVED ✅' : 'NOT APPROVED ❌'));
          
          // Update to approved if not already
          if (!existing.isApproved) {
            await session.run(
              'MATCH (w:WaitlistEntry {email: \$email}) SET w.isApproved = true, w.updatedAt = datetime() RETURN w',
              { email: '${EMAIL}' }
            );
            console.log('   Updated to APPROVED ✅');
          }
        } else {
          const result = await session.run(
            'CREATE (w:WaitlistEntry {email: \$email, isApproved: true, createdAt: datetime(), addedBy: \$addedBy, notes: \$notes}) RETURN w',
            { 
              email: '${EMAIL}', 
              addedBy: '${ADDED_BY}',
              notes: '${NOTES}'
            }
          );
          console.log('✅ Successfully added: ${EMAIL}');
        }
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      } finally {
        await session.close();
        await driver.close();
      }
    }
    
    addUser();
    " 2>&1 | grep -v "Warning:"
    
    return $?
}

# Function to add multiple users from file
add_bulk() {
    local FILE="$1"
    
    if [ ! -f "$FILE" ]; then
        print_error "File not found: $FILE"
        exit 1
    fi
    
    print_header "Adding Multiple Users"
    
    local SUCCESS=0
    local FAILED=0
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        if [[ -z "$line" || "$line" == \#* ]]; then
            continue
        fi
        
        # Parse email and notes (format: email,notes or just email)
        IFS=',' read -r email notes <<< "$line"
        email=$(echo "$email" | tr -d ' ')
        notes=$(echo "$notes" | sed 's/^ *//g')
        
        if add_user "$email" "$notes"; then
            ((SUCCESS++))
        else
            ((FAILED++))
        fi
        echo ""
    done < "$FILE"
    
    print_info "Summary: $SUCCESS added successfully, $FAILED failed"
}

# Function to list all approved users
list_users() {
    print_header "Approved Waitlist Users"
    
    POD_NAME=$(get_pod_name)
    if [ -z "$POD_NAME" ]; then
        print_error "No Starships pod found in namespace $NAMESPACE"
        return 1
    fi
    
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- node -e "
    const neo4j = require('neo4j-driver');
    
    const driver = neo4j.driver(
      '[NEO4J-LOCAL-URL]',
      neo4j.auth.basic('neo4j', '[DEFAULT-PASSWORD]')
    );
    
    async function listUsers() {
      const session = driver.session();
      try {
        const result = await session.run(
          'MATCH (w:WaitlistEntry {isApproved: true}) RETURN w ORDER BY w.createdAt DESC'
        );
        
        console.log('\\nApproved Users:\\n');
        console.log('Email                          | Added By    | Notes');
        console.log('-------------------------------|-------------|------------------------');
        
        result.records.forEach(record => {
          const user = record.get('w').properties;
          const email = user.email.padEnd(30);
          const addedBy = (user.addedBy || 'unknown').padEnd(12);
          const notes = user.notes || '';
          console.log(email + '| ' + addedBy + '| ' + notes);
        });
        
        console.log('\\nTotal: ' + result.records.length + ' approved users');
      } finally {
        await session.close();
        await driver.close();
      }
    }
    
    listUsers();
    " 2>&1 | grep -v "Warning:"
}

# Function to check if email is approved
check_user() {
    local EMAIL="$1"
    
    if ! validate_email "$EMAIL"; then
        print_error "Invalid email format: $EMAIL"
        return 1
    fi
    
    POD_NAME=$(get_pod_name)
    if [ -z "$POD_NAME" ]; then
        print_error "No Starships pod found in namespace $NAMESPACE"
        return 1
    fi
    
    print_info "Checking status for: $EMAIL"
    
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- node -e "
    const neo4j = require('neo4j-driver');
    
    const driver = neo4j.driver(
      '[NEO4J-LOCAL-URL]',
      neo4j.auth.basic('neo4j', '[DEFAULT-PASSWORD]')
    );
    
    async function checkUser() {
      const session = driver.session();
      try {
        const result = await session.run(
          'MATCH (w:WaitlistEntry {email: \$email}) RETURN w',
          { email: '${EMAIL}' }
        );
        
        if (result.records.length > 0) {
          const user = result.records[0].get('w').properties;
          console.log('\\n📧 Email: ' + user.email);
          console.log('✅ Status: ' + (user.isApproved ? 'APPROVED' : 'NOT APPROVED'));
          console.log('📝 Notes: ' + (user.notes || 'None'));
          console.log('👤 Added by: ' + (user.addedBy || 'Unknown'));
          console.log('📅 Created: ' + user.createdAt);
        } else {
          console.log('\\n❌ User not found in waitlist: ${EMAIL}');
        }
      } finally {
        await session.close();
        await driver.close();
      }
    }
    
    checkUser();
    " 2>&1 | grep -v "Warning:"
}

# Main script logic
case "$1" in
    add)
        if [ -z "$2" ]; then
            print_error "Email address is required!"
            echo "Usage: $0 add <email> [notes]"
            exit 1
        fi
        check_context
        add_user "$2" "$3"
        ;;
        
    add-bulk)
        if [ -z "$2" ]; then
            print_error "File path is required!"
            echo "Usage: $0 add-bulk <file.txt>"
            echo ""
            echo "File format (one per line):"
            echo "  email@example.com"
            echo "  email2@example.com,Optional notes here"
            echo "  # Comments start with #"
            exit 1
        fi
        check_context
        add_bulk "$2"
        ;;
        
    list)
        check_context
        list_users
        ;;
        
    check)
        if [ -z "$2" ]; then
            print_error "Email address is required!"
            echo "Usage: $0 check <email>"
            exit 1
        fi
        check_context
        check_user "$2"
        ;;
        
    *)
        print_header "Starships.ai Waitlist Manager"
        echo ""
        echo "Usage:"
        echo "  $0 add <email> [notes]      - Add single user"
        echo "  $0 add-bulk <file.txt>      - Add multiple users from file"
        echo "  $0 list                     - List all approved users"
        echo "  $0 check <email>            - Check if email is approved"
        echo ""
        echo "Examples:"
        echo "  $0 add user@example.com 'VIP access'"
        echo "  $0 add-bulk users.txt"
        echo "  $0 list"
        echo "  $0 check user@example.com"
        echo ""
        echo "Current settings:"
        echo "  Namespace: $NAMESPACE"
        echo "  Context: $CONTEXT"
        exit 1
        ;;
esac