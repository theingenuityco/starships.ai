import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentReportData {
  environment: string;
  deploymentResult: any;
  timestamp: string;
  additionalMetrics?: any;
}

export interface ReportSection {
  title: string;
  content: string;
  status: 'success' | 'warning' | 'error' | 'info';
}

/**
 * Comprehensive deployment reporter for connector instance architecture
 */
export class DeploymentReporter {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(process.cwd(), 'deploy', 'reports');
    this.ensureReportsDirectory();
  }

  /**
   * Generate comprehensive deployment report
   */
  async generateReport(data: DeploymentReportData): Promise<string> {
    console.log('[REPORTER] 📊 Generating deployment report...');

    const reportTimestamp = new Date(data.timestamp);
    const reportFileName = `deployment-report-${data.environment}-${reportTimestamp.toISOString().replace(/[:.]/g, '-')}.md`;
    const reportPath = path.join(this.reportsDir, reportFileName);

    const sections: ReportSection[] = [
      this.generateHeaderSection(data),
      this.generateExecutiveSummarySection(data),
      this.generateDeploymentDetailsSection(data),
      this.generateMigrationResultsSection(data),
      this.generateValidationResultsSection(data),
      this.generateHealthCheckResultsSection(data),
      this.generatePerformanceMetricsSection(data),
      this.generateBackupInformationSection(data),
      this.generateRecommendationsSection(data),
      this.generateTroubleshootingSection(data),
      this.generateAppendixSection(data),
    ];

    const reportContent = this.formatReport(sections);

    // Write report to file
    fs.writeFileSync(reportPath, reportContent, 'utf8');

    // Also generate JSON version for programmatic access
    const jsonReportPath = reportPath.replace('.md', '.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`[REPORTER] ✅ Deployment report generated: ${reportPath}`);
    console.log(`[REPORTER] 📄 JSON report generated: ${jsonReportPath}`);

    return reportPath;
  }

  /**
   * Generate header section
   */
  private generateHeaderSection(data: DeploymentReportData): ReportSection {
    const timestamp = new Date(data.timestamp);

    return {
      title: 'Deployment Report Header',
      status: 'info',
      content: `# Connector Instance Deployment Report

**Environment:** ${data.environment.toUpperCase()}  
**Deployment Date:** ${timestamp.toLocaleString()}  
**Report Generated:** ${new Date().toLocaleString()}  
**Status:** ${data.deploymentResult.success ? '✅ SUCCESS' : '❌ FAILED'}  
**Duration:** ${data.deploymentResult.duration}ms  

---
`,
    };
  }

  /**
   * Generate executive summary section
   */
  private generateExecutiveSummarySection(data: DeploymentReportData): ReportSection {
    const result = data.deploymentResult;
    const status = result.success ? 'success' : 'error';

    let summary = `## Executive Summary

The connector instance deployment to **${data.environment}** environment has **${result.success ? 'COMPLETED SUCCESSFULLY' : 'FAILED'}**.

### Key Metrics
- **Total Duration:** ${result.duration}ms
- **Phase Completed:** ${result.phase}
- **Errors:** ${result.errors.length}
- **Warnings:** ${result.warnings.length}
- **Backups Created:** ${result.backupPaths.length}

`;

    if (result.migrationResult) {
      summary += `### Migration Results
- **Relationships Migrated:** ${result.migrationResult.migratedCount || 0}
- **Starships Processed:** ${result.migrationResult.statistics?.totalStarships || 0}
- **Templates Available:** ${result.migrationResult.statistics?.totalTemplates || 0}
- **Connector Instances Created:** ${result.migrationResult.statistics?.createdConnectorInstances || 0}

`;
    }

    if (result.errors.length > 0) {
      summary += `### Critical Issues
${result.errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}

`;
    }

    if (result.warnings.length > 0) {
      summary += `### Warnings
${result.warnings.map((warning, index) => `${index + 1}. ${warning}`).join('\n')}

`;
    }

    return {
      title: 'Executive Summary',
      status,
      content: summary,
    };
  }

  /**
   * Generate deployment details section
   */
  private generateDeploymentDetailsSection(data: DeploymentReportData): ReportSection {
    const result = data.deploymentResult;

    const content = `## Deployment Details

### Environment Configuration
- **Target Environment:** ${data.environment}
- **Deployment Phase:** ${result.phase}
- **Start Time:** ${new Date(new Date(data.timestamp).getTime() - result.duration).toLocaleString()}
- **End Time:** ${new Date(data.timestamp).toLocaleString()}
- **Total Duration:** ${(result.duration / 1000).toFixed(2)} seconds

### Deployment Phases
The deployment process consists of the following phases:

1. **Pre-deployment Validation** - System readiness checks
2. **Schema Creation** - Database constraints and indexes
3. **Migration Testing** - Comprehensive test scenarios
4. **Migration Execution** - Data transformation
5. **Post-migration Validation** - Data integrity verification
6. **Health Checks** - System functionality validation
7. **Finalization** - Backup creation and reporting

### Current Status
- **Completed Phase:** ${result.phase}
- **Overall Status:** ${result.success ? 'SUCCESS' : 'FAILED'}

`;

    return {
      title: 'Deployment Details',
      status: result.success ? 'success' : 'error',
      content,
    };
  }

  /**
   * Generate migration results section
   */
  private generateMigrationResultsSection(data: DeploymentReportData): ReportSection {
    const migrationResult = data.deploymentResult.migrationResult;

    if (!migrationResult) {
      return {
        title: 'Migration Results',
        status: 'info',
        content: `## Migration Results

Migration was not executed or data is not available.

`,
      };
    }

    const content = `## Migration Results

### Migration Statistics
- **Success:** ${migrationResult.success ? 'Yes' : 'No'}
- **Relationships Migrated:** ${migrationResult.migratedCount}
- **Migration Duration:** ${migrationResult.duration}ms
- **Errors:** ${migrationResult.errors?.length || 0}

### Data Transformation Summary
- **Total Starships:** ${migrationResult.statistics?.totalStarships || 0}
- **Total Templates:** ${migrationResult.statistics?.totalTemplates || 0}
- **Original Relationships:** ${migrationResult.statistics?.totalRelationships || 0}
- **Connector Instances Created:** ${migrationResult.statistics?.createdConnectorInstances || 0}

### Architecture Change
The migration transformed the connector architecture from:
\`\`\`
Starship ──HAS_CONNECTOR──> MCPServerOption (Shared Template)
\`\`\`

To:
\`\`\`
Starship ──HAS_CONNECTOR_INSTANCE──> MCPServerConnector ──CREATED_FROM──> MCPServerOption
\`\`\`

This change enables:
- Individual connector instances per starship
- Independent status tracking
- Custom configuration per instance
- Better isolation and management

${
  migrationResult.errors?.length > 0
    ? `
### Migration Errors
${migrationResult.errors.map((error: string, index: number) => `${index + 1}. ${error}`).join('\n')}
`
    : ''
}

`;

    return {
      title: 'Migration Results',
      status: migrationResult.success ? 'success' : 'error',
      content,
    };
  }

  /**
   * Generate validation results section
   */
  private generateValidationResultsSection(data: DeploymentReportData): ReportSection {
    const validationResult = data.deploymentResult.validationResult;

    if (!validationResult) {
      return {
        title: 'Validation Results',
        status: 'info',
        content: `## Validation Results

Validation was not executed or data is not available.

`,
      };
    }

    const content = `## Validation Results

### Validation Status
- **Overall Status:** ${validationResult.valid ? 'PASSED' : 'FAILED'}
- **Errors:** ${validationResult.errors?.length || 0}
- **Warnings:** ${validationResult.warnings?.length || 0}

### Data Integrity Checks
${
  validationResult.statistics
    ? `
- **Total Starships:** ${validationResult.statistics.totalStarships}
- **Total Templates:** ${validationResult.statistics.totalTemplates}
- **Connector Instances:** ${validationResult.statistics.totalConnectorInstances}
- **Old Relationships:** ${validationResult.statistics.totalOldRelationships}
- **Orphaned Instances:** ${validationResult.statistics.orphanedInstances}
- **Duplicate Instances:** ${validationResult.statistics.duplicateInstances}
`
    : 'Statistics not available'
}

${
  validationResult.errors?.length > 0
    ? `
### Validation Errors
${validationResult.errors.map((error: string, index: number) => `${index + 1}. ${error}`).join('\n')}
`
    : ''
}

${
  validationResult.warnings?.length > 0
    ? `
### Validation Warnings
${validationResult.warnings.map((warning: string, index: number) => `${index + 1}. ${warning}`).join('\n')}
`
    : ''
}

`;

    return {
      title: 'Validation Results',
      status: validationResult.valid ? 'success' : 'error',
      content,
    };
  }

  /**
   * Generate health check results section
   */
  private generateHealthCheckResultsSection(data: DeploymentReportData): ReportSection {
    const healthResult = data.deploymentResult.healthCheckResult;

    if (!healthResult) {
      return {
        title: 'Health Check Results',
        status: 'info',
        content: `## Health Check Results

Health checks were not executed or data is not available.

`,
      };
    }

    const content = `## Health Check Results

### Overall Health Status
- **System Health:** ${healthResult.healthy ? 'HEALTHY' : 'UNHEALTHY'}
- **Response Time:** ${healthResult.metrics?.responseTime || 0}ms
- **Errors:** ${healthResult.errors?.length || 0}
- **Warnings:** ${healthResult.warnings?.length || 0}

### Component Status
${
  healthResult.metrics
    ? `
- **Database Connectivity:** ${healthResult.metrics.databaseConnectivity ? '✅ OK' : '❌ FAILED'}
- **Repository Functionality:** ${healthResult.metrics.repositoryFunctionality ? '✅ OK' : '❌ FAILED'}
- **Data Integrity:** ${healthResult.metrics.dataIntegrity ? '✅ OK' : '❌ FAILED'}
`
    : ''
}

### Performance Metrics
${
  healthResult.metrics?.performanceMetrics
    ? `
- **Query Response Time:** ${healthResult.metrics.performanceMetrics.queryResponseTime}ms
- **Memory Usage:** ${healthResult.metrics.performanceMetrics.memoryUsage.toFixed(2)}MB
- **Active Connections:** ${healthResult.metrics.performanceMetrics.activeConnections}
`
    : 'Performance metrics not available'
}

${
  healthResult.errors?.length > 0
    ? `
### Health Check Errors
${healthResult.errors.map((error: string, index: number) => `${index + 1}. ${error}`).join('\n')}
`
    : ''
}

${
  healthResult.warnings?.length > 0
    ? `
### Health Check Warnings
${healthResult.warnings.map((warning: string, index: number) => `${index + 1}. ${warning}`).join('\n')}
`
    : ''
}

`;

    return {
      title: 'Health Check Results',
      status: healthResult.healthy ? 'success' : 'error',
      content,
    };
  }

  /**
   * Generate performance metrics section
   */
  private generatePerformanceMetricsSection(data: DeploymentReportData): ReportSection {
    const result = data.deploymentResult;

    const content = `## Performance Metrics

### Deployment Performance
- **Total Deployment Time:** ${(result.duration / 1000).toFixed(2)} seconds
- **Average Phase Time:** ${result.duration ? (result.duration / 7).toFixed(2) : 'N/A'}ms

${
  result.migrationResult
    ? `
### Migration Performance
- **Migration Duration:** ${result.migrationResult.duration}ms
- **Relationships per Second:** ${
        result.migrationResult.migratedCount && result.migrationResult.duration
          ? (
              (result.migrationResult.migratedCount / result.migrationResult.duration) *
              1000
            ).toFixed(2)
          : 'N/A'
      }
- **Total Data Processed:** ${result.migrationResult.migratedCount} relationships
`
    : ''
}

${
  result.healthCheckResult?.metrics?.performanceMetrics
    ? `
### System Performance
- **Database Query Time:** ${result.healthCheckResult.metrics.performanceMetrics.queryResponseTime}ms
- **Memory Usage:** ${result.healthCheckResult.metrics.performanceMetrics.memoryUsage.toFixed(2)}MB
- **System Response Time:** ${result.healthCheckResult.metrics.responseTime}ms
`
    : ''
}

### Performance Benchmarks
- **Target Migration Time:** < 1 second per 100 relationships
- **Target Memory Usage:** < 100MB for 10,000 relationships
- **Target Query Response:** < 1000ms for complex queries

`;

    return {
      title: 'Performance Metrics',
      status: 'info',
      content,
    };
  }

  /**
   * Generate backup information section
   */
  private generateBackupInformationSection(data: DeploymentReportData): ReportSection {
    const result = data.deploymentResult;

    const content = `## Backup Information

### Backup Strategy
The deployment process creates comprehensive backups at key stages to ensure data safety and enable rollback capabilities.

### Created Backups
${
  result.backupPaths.length > 0
    ? `
${result.backupPaths.map((path: string, index: number) => `${index + 1}. \`${path}\``).join('\n')}
`
    : 'No backups were created during this deployment.'
}

### Rollback Capability
${
  result.migrationResult?.rollbackData
    ? `
- **Rollback Data Available:** Yes
- **Rollback Entries:** ${result.migrationResult.rollbackData.length}
- **Rollback Command:** \`npm run migration:rollback\`
`
    : `
- **Rollback Data Available:** No
- **Manual Rollback:** Use pre-deployment backup if needed
`
}

### Backup Retention
- **Retention Policy:** Keep backups for 30 days
- **Storage Location:** \`deploy/backups/\`
- **Cleanup Command:** \`npm run deployment:cleanup-backups\`

`;

    return {
      title: 'Backup Information',
      status: 'info',
      content,
    };
  }

  /**
   * Generate recommendations section
   */
  private generateRecommendationsSection(data: DeploymentReportData): ReportSection {
    const result = data.deploymentResult;
    const recommendations: string[] = [];

    // Generate recommendations based on deployment results
    if (result.success) {
      recommendations.push('✅ Deployment completed successfully - no immediate action required');
      recommendations.push('📊 Monitor system performance for the next 24 hours');
      recommendations.push('🔍 Run periodic health checks to ensure system stability');
    } else {
      recommendations.push('❌ Deployment failed - immediate attention required');
      recommendations.push('🔄 Review error logs and consider rollback if necessary');
      recommendations.push('🛠️ Address identified issues before retry');
    }

    if (result.warnings.length > 0) {
      recommendations.push('⚠️ Review and address deployment warnings');
    }

    if (result.healthCheckResult?.warnings?.length > 0) {
      recommendations.push('🏥 Address health check warnings for optimal performance');
    }

    // Performance recommendations
    if (result.migrationResult?.duration > 10000) {
      recommendations.push('⚡ Consider performance optimization for future migrations');
    }

    // Environment-specific recommendations
    if (data.environment === 'production') {
      recommendations.push('🚀 Schedule post-deployment monitoring and alerting setup');
      recommendations.push('📈 Plan capacity monitoring for increased load');
    }

    const content = `## Recommendations

### Immediate Actions
${recommendations
  .slice(0, 3)
  .map((rec, index) => `${index + 1}. ${rec}`)
  .join('\n')}

### Follow-up Actions
${recommendations
  .slice(3)
  .map((rec, index) => `${index + 4}. ${rec}`)
  .join('\n')}

### Monitoring Setup
- Set up alerts for connector instance failures
- Monitor database performance metrics
- Track memory usage and query response times
- Implement health check automation

### Documentation Updates
- Update deployment runbooks with lessons learned
- Document any configuration changes made
- Update troubleshooting guides with new scenarios

`;

    return {
      title: 'Recommendations',
      status: 'info',
      content,
    };
  }

  /**
   * Generate troubleshooting section
   */
  private generateTroubleshootingSection(data: DeploymentReportData): ReportSection {
    const content = `## Troubleshooting Guide

### Common Issues and Solutions

#### Migration Failures
- **Issue:** Migration timeout or connection errors
- **Solution:** Check database connectivity and increase timeout values
- **Command:** \`npm run deployment:validate-pre\`

#### Validation Errors
- **Issue:** Data integrity validation fails
- **Solution:** Run comprehensive validation and fix data inconsistencies
- **Command:** \`npm run migration:validate\`

#### Health Check Failures
- **Issue:** System health checks fail after deployment
- **Solution:** Check individual components and restart services if needed
- **Command:** \`npm run deployment:health-check\`

#### Performance Issues
- **Issue:** Slow query performance after migration
- **Solution:** Verify indexes are created and optimize queries
- **Command:** \`npm run deployment:performance-check\`

### Emergency Procedures

#### Rollback Process
1. Stop application services
2. Run rollback command: \`npm run migration:rollback\`
3. Verify data integrity: \`npm run migration:validate\`
4. Restart application services
5. Run health checks: \`npm run deployment:health-check\`

#### Data Recovery
1. Identify backup location from this report
2. Stop application services
3. Restore from backup: \`npm run deployment:restore <backup-path>\`
4. Verify data integrity
5. Restart services and validate

### Support Contacts
- **Development Team:** dev-team@company.com
- **DevOps Team:** devops@company.com
- **On-call Engineer:** +1-555-ON-CALL

`;

    return {
      title: 'Troubleshooting Guide',
      status: 'info',
      content,
    };
  }

  /**
   * Generate appendix section
   */
  private generateAppendixSection(data: DeploymentReportData): ReportSection {
    const content = `## Appendix

### Environment Variables
\`\`\`
NEO4J_URI=${process.env.NEO4J_URI || 'Not set'}
NEO4J_DATABASE=${process.env.NEO4J_DATABASE || 'Not set'}
NODE_ENV=${process.env.NODE_ENV || 'Not set'}
\`\`\`

### System Information
- **Node.js Version:** ${process.version}
- **Platform:** ${process.platform}
- **Architecture:** ${process.arch}
- **Memory Usage:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
- **Uptime:** ${(process.uptime() / 3600).toFixed(2)} hours

### Deployment Configuration
\`\`\`json
${JSON.stringify(
  {
    environment: data.environment,
    timestamp: data.timestamp,
    phase: data.deploymentResult.phase,
    duration: data.deploymentResult.duration,
  },
  null,
  2
)}
\`\`\`

### Related Documentation
- [Connector Instance Architecture](../docs/connector-instance-architecture-diagram.md)
- [Implementation Plan](../docs/connector-instance-implementation-plan.md)
- [Migration Guide](../docs/migration-guide.md)
- [Troubleshooting Guide](../docs/troubleshooting-guide.md)

---

*Report generated by Connector Instance Deployment System*  
*Generated at: ${new Date().toISOString()}*
`;

    return {
      title: 'Appendix',
      status: 'info',
      content,
    };
  }

  /**
   * Format the complete report
   */
  private formatReport(sections: ReportSection[]): string {
    return sections.map((section) => section.content).join('\n');
  }

  /**
   * Ensure reports directory exists
   */
  private ensureReportsDirectory(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Generate summary report for multiple deployments
   */
  async generateSummaryReport(deployments: DeploymentReportData[]): Promise<string> {
    console.log('[REPORTER] 📊 Generating deployment summary report...');

    const summaryFileName = `deployment-summary-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    const summaryPath = path.join(this.reportsDir, summaryFileName);

    const successfulDeployments = deployments.filter((d) => d.deploymentResult.success);
    const failedDeployments = deployments.filter((d) => !d.deploymentResult.success);

    const content = `# Deployment Summary Report

**Generated:** ${new Date().toLocaleString()}  
**Total Deployments:** ${deployments.length}  
**Successful:** ${successfulDeployments.length}  
**Failed:** ${failedDeployments.length}  
**Success Rate:** ${((successfulDeployments.length / deployments.length) * 100).toFixed(1)}%

## Deployment Overview

${deployments
  .map(
    (deployment, index) => `
### ${index + 1}. ${deployment.environment.toUpperCase()} - ${new Date(deployment.timestamp).toLocaleString()}
- **Status:** ${deployment.deploymentResult.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Duration:** ${deployment.deploymentResult.duration}ms
- **Phase:** ${deployment.deploymentResult.phase}
- **Errors:** ${deployment.deploymentResult.errors.length}
- **Warnings:** ${deployment.deploymentResult.warnings.length}
`
  )
  .join('\n')}

## Performance Metrics

- **Average Duration:** ${(deployments.reduce((sum, d) => sum + d.deploymentResult.duration, 0) / deployments.length).toFixed(0)}ms
- **Fastest Deployment:** ${Math.min(...deployments.map((d) => d.deploymentResult.duration))}ms
- **Slowest Deployment:** ${Math.max(...deployments.map((d) => d.deploymentResult.duration))}ms

## Common Issues

${
  failedDeployments.length > 0
    ? `
### Failed Deployments
${failedDeployments
  .map(
    (d) => `
- **${d.environment}:** ${d.deploymentResult.errors.join(', ')}
`
  )
  .join('')}
`
    : 'No failed deployments to report.'
}

---

*Summary generated by Connector Instance Deployment System*
`;

    fs.writeFileSync(summaryPath, content, 'utf8');
    console.log(`[REPORTER] ✅ Summary report generated: ${summaryPath}`);

    return summaryPath;
  }
}
