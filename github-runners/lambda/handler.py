import json
import boto3
import base64
import os
import hmac
import hashlib
import time
import jwt
import requests
from datetime import datetime, timedelta

# AWS clients
ec2 = boto3.client('ec2', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
ssm = boto3.client('ssm', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

# Environment variables
GITHUB_APP_ID = os.environ['GITHUB_APP_ID']
GITHUB_APP_PRIVATE_KEY = base64.b64decode(os.environ['GITHUB_APP_PRIVATE_KEY_BASE64']).decode('utf-8')
GITHUB_WEBHOOK_SECRET = os.environ['GITHUB_WEBHOOK_SECRET']
GITHUB_INSTALLATION_ID = os.environ['GITHUB_INSTALLATION_ID']
RUNNER_SECURITY_GROUP_ID = os.environ['RUNNER_SECURITY_GROUP_ID']
RUNNER_INSTANCE_PROFILE_NAME = os.environ['RUNNER_INSTANCE_PROFILE_NAME']
RUNNER_AMI_ID = os.environ.get('RUNNER_AMI_ID', 'ami-0e2c8caa4b6378d8c')  # Ubuntu 22.04 LTS in us-east-1
RUNNER_SUBNET_ID = os.environ.get('RUNNER_SUBNET_ID')  # Optional, uses default if not specified

def lambda_handler(event, context):
    """Main Lambda handler for GitHub webhook events"""
    
    # Verify webhook signature
    if not verify_webhook_signature(event):
        return {'statusCode': 401, 'body': json.dumps('Unauthorized')}
    
    # Parse webhook payload
    try:
        body = json.loads(event['body'])
    except json.JSONDecodeError:
        return {'statusCode': 400, 'body': json.dumps('Invalid JSON')}
    
    # Process workflow_job events
    # Get headers (case-insensitive)
    headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
    github_event = headers.get('x-github-event', '')
    
    if github_event != 'workflow_job':
        return {'statusCode': 200, 'body': json.dumps('Not a workflow_job event')}
    
    action = body.get('action')
    
    if action == 'queued':
        return handle_job_queued(body)
    elif action == 'completed':
        return handle_job_completed(body)
    
    return {'statusCode': 200, 'body': json.dumps(f'Action {action} not handled')}

def verify_webhook_signature(event):
    """Verify GitHub webhook signature"""
    # Get headers (case-insensitive)
    headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
    signature = headers.get('x-hub-signature-256', '')
    
    
    if not signature:
        return False
    
    body = event.get('body', '')
    expected_signature = 'sha256=' + hmac.new(
        GITHUB_WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()
    
    result = hmac.compare_digest(signature, expected_signature)
    
    return result

def get_github_app_token():
    """Generate JWT token for GitHub App authentication"""
    now = int(time.time())
    payload = {
        'iat': now,
        'exp': now + 600,  # 10 minutes
        'iss': GITHUB_APP_ID
    }
    
    return jwt.encode(payload, GITHUB_APP_PRIVATE_KEY, algorithm='RS256')

def get_installation_token():
    """Get installation access token for GitHub App"""
    jwt_token = get_github_app_token()
    
    headers = {
        'Authorization': f'Bearer {jwt_token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    
    response = requests.post(
        f'https://api.github.com/app/installations/{GITHUB_INSTALLATION_ID}/access_tokens',
        headers=headers
    )
    
    if response.status_code != 201:
        raise Exception(f"Failed to get installation token: {response.text}")
    
    return response.json()['token']

def get_runner_registration_token(repo_url):
    """Get registration token for self-hosted runner"""
    installation_token = get_installation_token()
    
    # Extract owner and repo from URL
    parts = repo_url.replace('https://github.com/', '').split('/')
    owner = parts[0]
    repo = parts[1]
    
    headers = {
        'Authorization': f'token {installation_token}',
        'Accept': 'application/vnd.github.v3+json'
    }
    
    response = requests.post(
        f'https://api.github.com/repos/{owner}/{repo}/actions/runners/registration-token',
        headers=headers
    )
    
    if response.status_code != 201:
        raise Exception(f"Failed to get runner registration token: {response.text}")
    
    return response.json()['token']

def handle_job_queued(body):
    """Handle workflow_job queued event"""
    workflow_job = body.get('workflow_job', {})
    repository = body.get('repository', {})
    
    # Check if job requires self-hosted runner
    labels = workflow_job.get('labels', [])
    
    if 'self-hosted' not in labels:
        return {'statusCode': 200, 'body': json.dumps('Not a self-hosted job')}
    
    repo_url = repository.get('html_url')
    job_id = workflow_job.get('id')
    run_id = workflow_job.get('run_id')
    
    try:
        # Get runner registration token
        registration_token = get_runner_registration_token(repo_url)
        
        # Create user data script
        user_data_script = create_user_data_script(repo_url, registration_token, labels, job_id)
        
        # Launch EC2 instance with dynamic sizing
        workflow_name = workflow_job.get('workflow_name')
        job_name = workflow_job.get('name')
        instance_id = launch_ec2_instance(user_data_script, job_id, run_id, repo_url, labels, workflow_name, job_name)
        
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Runner instance launched',
                'instance_id': instance_id,
                'job_id': job_id
            })
        }
    
    except Exception as e:
        print(f"Error launching runner: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Failed to launch runner: {str(e)}')
        }

def handle_job_completed(body):
    """Handle workflow_job completed event - cleanup if needed"""
    # In our ephemeral setup, instances self-terminate
    # This handler is for logging/monitoring purposes
    workflow_job = body.get('workflow_job', {})
    job_id = workflow_job.get('id')
    
    
    return {'statusCode': 200, 'body': json.dumps('Job completed')}

def create_user_data_script(repo_url, registration_token, labels, job_id):
    """Create user data script for EC2 instance"""
    runner_name = f"ephemeral-runner-{job_id}"
    labels_str = ','.join(labels)
    
    script = f"""#!/bin/bash
set -e  # Exit on error

echo "=== Starting GitHub Runner Setup ==="
echo "Repository: {repo_url}"
echo "Runner name: {runner_name}"

# Update system
echo "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y curl wget jq git build-essential

# Create runner user
echo "Creating runner user..."
useradd -m -s /bin/bash runner || echo "User already exists"

# Download GitHub Actions runner
echo "Downloading GitHub Actions runner..."
cd /home/runner
RUNNER_VERSION="2.321.0"
wget -q -O actions-runner-linux-x64.tar.gz https://github.com/actions/runner/releases/download/v${{RUNNER_VERSION}}/actions-runner-linux-x64-${{RUNNER_VERSION}}.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
chown -R runner:runner /home/runner

# Install runner dependencies
echo "Installing runner dependencies..."
./bin/installdependencies.sh

# Configure runner
echo "Configuring runner..."
sudo -u runner ./config.sh --url {repo_url} \
    --token {registration_token} \
    --name {runner_name} \
    --labels {labels_str} \
    --ephemeral \
    --unattended \
    --replace 2>/dev/null

# Install Node.js for workflows
echo "Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm

# Start runner and wait for completion
echo "Starting runner..."
cd /home/runner
sudo -u runner ./run.sh

# Runner completed, shutdown
echo "Job completed, shutting down..."
shutdown -h now
"""
    
    # Encode to base64 for EC2 UserData
    return base64.b64encode(script.encode()).decode()

def determine_instance_type(labels, workflow_name=None, job_name=None):
    """Determine appropriate instance type based on job requirements"""
    
    # Check for explicit instance type in runner labels
    # Format: runs-on: [self-hosted, linux, x64, instance:t3.large]
    for label in labels:
        if label.startswith('instance:'):
            requested_type = label.split(':', 1)[1]
            print(f"Explicit instance type requested: {requested_type}")
            return requested_type
    
    # Legacy keyword-based fallback
    labels_str = ','.join(labels).lower()
    workflow_name_str = (workflow_name or '').lower()
    job_name_str = (job_name or '').lower()
    
    # Resource-intensive jobs that need larger instances
    if any(keyword in labels_str or keyword in workflow_name_str or keyword in job_name_str for keyword in [
        'codeql', 'security', 'large', 'heavy', 'analysis'
    ]):
        return 't3.large'  # 8GB RAM, 2 vCPUs - for CodeQL and security analysis
    
    # Build jobs might need medium instances
    if any(keyword in labels_str or keyword in workflow_name_str or keyword in job_name_str for keyword in [
        'build', 'compile', 'medium'
    ]):
        return 't3.medium'  # 4GB RAM, 2 vCPUs - for builds
    
    # Default for most jobs (linting, testing, etc.)
    return 't3.small'  # 2GB RAM, 2 vCPUs - cost-effective default

def launch_ec2_instance(user_data, job_id, run_id, repo_url, labels, workflow_name=None, job_name=None):
    """Launch EC2 Spot instance for runner with dynamic sizing"""
    
    # Determine instance type based on job requirements
    instance_type = determine_instance_type(labels, workflow_name, job_name)
    
    print(f"Selected instance type: {instance_type} for job {job_id}")
    
    # Instance configuration
    instance_params = {
        'ImageId': RUNNER_AMI_ID,
        'InstanceType': instance_type,
        'MaxCount': 1,
        'MinCount': 1,
        'UserData': user_data,
        'IamInstanceProfile': {
            'Name': RUNNER_INSTANCE_PROFILE_NAME
        },
        'SecurityGroupIds': [RUNNER_SECURITY_GROUP_ID],
        'InstanceMarketOptions': {
            'MarketType': 'spot',
            'SpotOptions': {
                'SpotInstanceType': 'one-time',
                'InstanceInterruptionBehavior': 'terminate'
            }
        },
        'TagSpecifications': [
            {
                'ResourceType': 'instance',
                'Tags': [
                    {'Key': 'Name', 'Value': f'github-runner-{job_id}'},
                    {'Key': 'Type', 'Value': 'github-runner'},
                    {'Key': 'JobId', 'Value': str(job_id)},
                    {'Key': 'RunId', 'Value': str(run_id)},
                    {'Key': 'Repository', 'Value': repo_url},
                    {'Key': 'Ephemeral', 'Value': 'true'}
                ]
            }
        ],
        'InstanceInitiatedShutdownBehavior': 'terminate'
    }
    
    # Add subnet if specified
    if RUNNER_SUBNET_ID:
        instance_params['SubnetId'] = RUNNER_SUBNET_ID
    
    # Launch instance
    response = ec2.run_instances(**instance_params)
    
    instance_id = response['Instances'][0]['InstanceId']
    
    return instance_id