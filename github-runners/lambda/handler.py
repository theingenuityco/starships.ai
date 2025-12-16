import json
import boto3
import base64
import os
import hmac
import hashlib
import time
import jwt
import requests

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
# Default AMIs (us-east-1, Ubuntu 24.04 LTS "noble", 2025-10-22)
# These can be overridden via Lambda environment variables.
RUNNER_AMI_ID_X64 = os.environ.get('RUNNER_AMI_ID_X64', 'ami-0ecb62995f68bb549')
RUNNER_AMI_ID_ARM64 = os.environ.get('RUNNER_AMI_ID_ARM64', 'ami-01b9f1e7dc427266e')
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

        # Launch EC2 instance with labels for instance type selection
        instance_id = launch_ec2_instance(user_data_script, job_id, run_id, repo_url, labels)

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

def get_instance_type_from_labels(labels):
    """
    Extract instance type from workflow labels.
    Looks for any label matching AWS instance type pattern (e.g., 't3.large', 'c5.xlarge').
    Returns 't3.medium' as default if no instance type label found.
    """
    for label in labels:
        # Check if label matches instance type pattern (contains a dot)
        if '.' in label and not label.startswith('self-hosted'):
            print(f"Found instance type label: {label}")
            return label

    print("No instance type label found, defaulting to t3.medium")
    return 't3.medium'

def is_arm_instance_type(instance_type: str) -> bool:
    """
    Best-effort detection of ARM/Graviton instance types.
    Examples: t4g.*, m6g.*, c7g.*, r6g.*, a1.* are ARM.
    """
    if not instance_type:
        return False
    family = instance_type.split('.')[0]
    return family.endswith('g') or family in {'a1'}

def get_arch_from_labels(labels):
    """
    Determine architecture requested by workflow labels.
    Priority:
      1) Explicit label: arm64/aarch64/x64/amd64
      2) Infer from instance type label (e.g., t4g.* => arm64)
      3) Default: x64
    """
    lowered = [str(l).lower() for l in (labels or [])]
    if 'arm64' in lowered or 'aarch64' in lowered:
        return 'arm64'
    if 'x64' in lowered or 'amd64' in lowered:
        return 'x64'

    instance_type = get_instance_type_from_labels(labels or [])
    if is_arm_instance_type(instance_type):
        return 'arm64'
    return 'x64'

def select_instance_type(labels, arch: str) -> str:
    """
    Choose instance type from labels, but keep it consistent with requested arch.
    Defaults:
      - x64   => t3.medium
      - arm64 => t4g.medium
    """
    requested = get_instance_type_from_labels(labels or [])
    if arch == 'arm64':
        if requested and is_arm_instance_type(requested):
            return requested
        return 't4g.medium'

    # x64
    if requested and not is_arm_instance_type(requested):
        return requested
    return 't3.medium'

def get_ami_id_for_arch(arch: str) -> str:
    """
    Select AMI based on arch.
    - x64:  RUNNER_AMI_ID_X64
    - arm64: RUNNER_AMI_ID_ARM64 (recommended) else fallback to x64 AMI (will likely fail to boot)
    """
    if arch == 'arm64':
        return RUNNER_AMI_ID_ARM64 or RUNNER_AMI_ID_X64
    return RUNNER_AMI_ID_X64

def create_user_data_script(repo_url, registration_token, labels, job_id):
    """Create user data script for EC2 instance"""
    runner_name = f"ephemeral-runner-{job_id}"
    labels_str = ','.join(labels)
    arch = get_arch_from_labels(labels)
    runner_arch = "x64" if arch == "x64" else "arm64"
    install_docker = 'docker' in [str(l).lower() for l in (labels or [])]

    script = f"""#!/bin/bash
set -e  # Exit on error

echo "=== Starting GitHub Runner Setup ==="
echo "Repository: {repo_url}"
echo "Runner name: {runner_name}"
echo "Runner arch: {arch}"

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
wget -q -O actions-runner-linux-{runner_arch}.tar.gz https://github.com/actions/runner/releases/download/v${{RUNNER_VERSION}}/actions-runner-linux-{runner_arch}-${{RUNNER_VERSION}}.tar.gz
tar xzf actions-runner-linux-{runner_arch}.tar.gz
chown -R runner:runner /home/runner

# Install runner dependencies
echo "Installing runner dependencies..."
./bin/installdependencies.sh

# Configure runner
echo "Configuring runner..."
sudo -u runner ./config.sh --url {repo_url} \\
    --token {registration_token} \\
    --name {runner_name} \\
    --labels {labels_str} \\
    --ephemeral \\
    --unattended \\
    --replace 2>/dev/null

# Install Node.js for workflows
echo "Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm
"""

    if install_docker:
        script += f"""

# Optional: Install Docker for workflows that build images
echo "Installing Docker..."
apt-get install -y ca-certificates gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker runner || true
systemctl enable docker
systemctl start docker
"""

    script += f"""

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

def launch_ec2_instance(user_data, job_id, run_id, repo_url, labels=None):
    """Launch EC2 Spot instance for runner"""

    if labels is None:
        labels = []
    arch = get_arch_from_labels(labels)
    instance_type = select_instance_type(labels, arch)
    ami_id = get_ami_id_for_arch(arch)

    print(f"Launching instance with type: {instance_type}")
    print(f"Launching instance arch: {arch}")
    print(f"Using AMI: {ami_id}")

    # Instance configuration
    instance_params = {
        'ImageId': ami_id,
        'InstanceType': instance_type,
        'MaxCount': 1,
        'MinCount': 1,
        'UserData': user_data,
        'IamInstanceProfile': {
            'Name': RUNNER_INSTANCE_PROFILE_NAME
        },
        'SecurityGroupIds': [RUNNER_SECURITY_GROUP_ID],
        'BlockDeviceMappings': [
            {
                'DeviceName': '/dev/sda1',
                'Ebs': {
                    'VolumeSize': 20,  # 20GB instead of default 8GB
                    'VolumeType': 'gp3',
                    'DeleteOnTermination': True
                }
            }
        ],
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
                    {'Key': 'Ephemeral', 'Value': 'true'},
                    {'Key': 'InstanceType', 'Value': instance_type}
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
    print(f"Successfully launched {instance_type} instance {instance_id} for job {job_id}")
    return instance_id
