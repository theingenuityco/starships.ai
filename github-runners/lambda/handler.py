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
    if event['headers'].get('x-github-event', '') != 'workflow_job':
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
    
    print(f"Headers received: {list(headers.keys())}")
    print(f"Signature header present: {'x-hub-signature-256' in headers}")
    
    if not signature:
        print("No signature header found")
        return False
    
    body = event.get('body', '')
    expected_signature = 'sha256=' + hmac.new(
        GITHUB_WEBHOOK_SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()
    
    print(f"Received signature: {signature[:20]}...")
    print(f"Expected signature: {expected_signature[:20]}...")
    
    result = hmac.compare_digest(signature, expected_signature)
    print(f"Signature verification result: {result}")
    
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
        
        # Launch EC2 instance
        instance_id = launch_ec2_instance(user_data_script, job_id, run_id, repo_url)
        
        print(f"Launched instance {instance_id} for job {job_id}")
        
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
    
    print(f"Job {job_id} completed")
    
    return {'statusCode': 200, 'body': json.dumps('Job completed')}

def create_user_data_script(repo_url, registration_token, labels, job_id):
    """Create user data script for EC2 instance"""
    runner_name = f"ephemeral-runner-{job_id}"
    labels_str = ','.join(labels)
    
    script = f"""#!/bin/bash
set -e

# Logging
exec > >(tee /var/log/runner-setup.log)
exec 2>&1

echo "Starting runner setup at $(date)"

# Update system
apt-get update
apt-get install -y curl wget jq

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Create runner user
useradd -m -s /bin/bash runner
cd /home/runner

# Download and install GitHub Actions runner
RUNNER_VERSION="2.321.0"
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/v${{RUNNER_VERSION}}/actions-runner-linux-x64-${{RUNNER_VERSION}}.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
chown -R runner:runner .

# Configure runner
sudo -u runner ./config.sh --url {repo_url} \
    --token {registration_token} \
    --name {runner_name} \
    --labels {labels_str} \
    --ephemeral \
    --unattended \
    --disableupdate

# Start runner
sudo -u runner ./run.sh &

# Wait for runner to pick up job
echo "Waiting for runner to start..."
sleep 10

# Monitor runner process
RUNNER_PID=$(pgrep -f "Runner.Listener")

while kill -0 $RUNNER_PID 2>/dev/null; do
    sleep 5
done

echo "Runner process completed, initiating shutdown..."

# Cleanup and shutdown
shutdown -h now
"""
    
    # Encode to base64 for EC2 UserData
    return base64.b64encode(script.encode()).decode()

def launch_ec2_instance(user_data, job_id, run_id, repo_url):
    """Launch EC2 Spot instance for runner"""
    
    # Instance configuration
    instance_params = {
        'ImageId': RUNNER_AMI_ID,
        'InstanceType': 't3.small',
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