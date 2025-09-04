import json
import boto3
import os
from datetime import datetime, timedelta

ec2 = boto3.client('ec2', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

def lambda_handler(event, context):
    """Cleanup orphaned GitHub runner instances"""
    
    max_age_hours = int(os.environ.get('MAX_INSTANCE_AGE_HOURS', '2'))
    cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
    
    try:
        # Find runner instances
        response = ec2.describe_instances(
            Filters=[
                {'Name': 'tag:Type', 'Values': ['github-runner']},
                {'Name': 'instance-state-name', 'Values': ['running', 'pending']}
            ]
        )
        
        terminated_count = 0
        
        for reservation in response['Reservations']:
            for instance in reservation['Instances']:
                instance_id = instance['InstanceId']
                launch_time = instance['LaunchTime'].replace(tzinfo=None)
                
                # Check if instance is older than max age
                if launch_time < cutoff_time:
                    print(f"Terminating orphaned instance {instance_id} (launched at {launch_time})")
                    
                    try:
                        ec2.terminate_instances(InstanceIds=[instance_id])
                        terminated_count += 1
                    except Exception as e:
                        print(f"Failed to terminate {instance_id}: {str(e)}")
        
        message = f"Cleanup completed. Terminated {terminated_count} orphaned instances."
        print(message)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': message,
                'terminated_count': terminated_count
            })
        }
    
    except Exception as e:
        print(f"Cleanup error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Cleanup failed: {str(e)}')
        }