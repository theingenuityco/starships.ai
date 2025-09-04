# GitHub Self-Hosted Runners Setup

This directory contains all the necessary files to set up ephemeral self-hosted GitHub runners on AWS.

## Directory Structure
```
github-runners/
├── README.md                    # This file
├── setup-github-app.md          # GitHub App setup instructions
├── DEPLOYMENT.md                # Deployment instructions
├── WORKFLOW_MIGRATION.md        # Guide for migrating workflows
├── lambda/
│   ├── handler.py              # Lambda webhook handler
│   ├── cleanup.py              # Cleanup Lambda function
│   └── requirements.txt        # Python dependencies
├── terraform/
│   ├── main.tf                 # Main Terraform configuration
│   ├── variables.tf            # Variable definitions
│   ├── outputs.tf              # Output values
│   └── terraform.tfvars.example
└── workflow-patches/            # Patch files for existing workflows
    ├── ci-checks.yml.patch
    ├── discord-pr-sync.yml.patch
    └── security.yml.patch
```

## Quick Start

1. Follow `setup-github-app.md` to create and configure GitHub App
2. Deploy AWS infrastructure using Terraform
3. Update workflows to use self-hosted runners
4. Test with a simple workflow first

## Support

For issues or questions, check the troubleshooting section in each component's documentation.