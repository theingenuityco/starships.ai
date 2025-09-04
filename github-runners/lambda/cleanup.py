import boto3
import os
from datetime import datetime, timezone, timedelta

ec2 = boto3.client('ec2', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

def lambda_handler(event, context):
    """Clean up orphaned runner instances older than MAX_INSTANCE_AGE_HOURS"""
    
    max_age_hours = int(os.environ.get('MAX_INSTANCE_AGE_HOURS', '2'))
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    
    # Find runner instances
    response = ec2.describe_instances(
        Filters=[
            {'Name': 'tag:Type', 'Values': ['github-runner']},
            {'Name': 'instance-state-name', 'Values': ['running']}
        ]
    )
    
    terminated = []
    
    for reservation in response['Reservations']:
        for instance in reservation['Instances']:
            launch_time = instance['LaunchTime']
            instance_id = instance['InstanceId']
            
            # Check if instance is older than threshold
            if launch_time < cutoff_time:
                ec2.terminate_instances(InstanceIds=[instance_id])
                terminated.append(instance_id)
    
    return {
        'statusCode': 200,
        'body': f'Terminated {len(terminated)} orphaned instances: {terminated}'
    }