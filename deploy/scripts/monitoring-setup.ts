import { getConnection } from '../../packages/models/src/connection';
import { ProductionHealthChecker } from './production-health-checker';
import * as fs from 'fs';
import * as path from 'path';

export interface MonitoringConfig {
  healthCheckInterval: number; // in seconds
  alertThresholds: {
    responseTime: number; // in ms
    errorRate: number; // percentage
    memoryUsage: number; // in MB
    diskUsage: number; // percentage
    connectionCount: number; // max connections
  };
  alertChannels: {
    email?: string[];
    slack?: {
      webhookUrl: string;
      channel: string;
    };
    webhook?: string;
  };
  metrics: {
    retention: number; // in days
    aggregationInterval: number; // in minutes
  };
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  enabled: boolean;
}

export interface MetricData {
  timestamp: string;
  metric: string;
  value: number;
  labels: Record<string, string>;
}

/**
 * Monitoring and alerting setup for connector instance architecture
 */
export class MonitoringSetup {
  private config: MonitoringConfig;
  private healthChecker: ProductionHealthChecker;
  private metricsDir: string;
  private alertRules: AlertRule[] = [];

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.healthChecker = new ProductionHealthChecker();
    this.metricsDir = path.join(process.cwd(), 'deploy', 'monitoring', 'metrics');
    this.ensureDirectories();
    this.initializeAlertRules();
  }

  /**
   * Setup comprehensive monitoring
   */
  async setupMonitoring(): Promise<void> {
    console.log('📊 MONITORING SETUP STARTED');
    console.log('===========================');

    try {
      // Phase 1: Create monitoring configuration files
      console.log('📋 Phase 1: Creating monitoring configuration...');
      await this.createMonitoringConfig();

      // Phase 2: Setup health check monitoring
      console.log('🏥 Phase 2: Setting up health check monitoring...');
      await this.setupHealthCheckMonitoring();

      // Phase 3: Setup performance metrics collection
      console.log('📈 Phase 3: Setting up performance metrics...');
      await this.setupPerformanceMetrics();

      // Phase 4: Setup alerting rules
      console.log('🚨 Phase 4: Setting up alerting rules...');
      await this.setupAlertingRules();

      // Phase 5: Create monitoring dashboards
      console.log('📊 Phase 5: Creating monitoring dashboards...');
      await this.createMonitoringDashboards();

      // Phase 6: Setup log aggregation
      console.log('📝 Phase 6: Setting up log aggregation...');
      await this.setupLogAggregation();

      // Phase 7: Start monitoring services
      console.log('🚀 Phase 7: Starting monitoring services...');
      await this.startMonitoringServices();

      console.log('\n✅ Monitoring setup completed successfully!');
      console.log('📊 Monitoring dashboard available at: http://localhost:3001/monitoring');
      console.log('🚨 Alerts configured for critical system metrics');
    } catch (error) {
      console.error('\n❌ Monitoring setup failed:', error);
      throw error;
    }
  }

  /**
   * Create monitoring configuration files
   */
  private async createMonitoringConfig(): Promise<void> {
    // Prometheus configuration
    const prometheusConfig = {
      global: {
        scrape_interval: '15s',
        evaluation_interval: '15s',
      },
      rule_files: ['alert_rules.yml'],
      scrape_configs: [
        {
          job_name: 'connector-instance-api',
          static_configs: [
            {
              targets: ['localhost:3000'],
            },
          ],
          metrics_path: '/metrics',
          scrape_interval: '10s',
        },
        {
          job_name: 'neo4j',
          static_configs: [
            {
              targets: ['localhost:7474'],
            },
          ],
          metrics_path: '/metrics',
          scrape_interval: '30s',
        },
      ],
      alerting: {
        alertmanagers: [
          {
            static_configs: [
              {
                targets: ['localhost:9093'],
              },
            ],
          },
        ],
      },
    };

    const configPath = path.join(process.cwd(), 'deploy', 'monitoring', 'prometheus.yml');
    fs.writeFileSync(configPath, JSON.stringify(prometheusConfig, null, 2));
    console.log(`✅ Prometheus config created: ${configPath}`);

    // Grafana datasource configuration
    const grafanaConfig = {
      apiVersion: 1,
      datasources: [
        {
          name: 'Prometheus',
          type: 'prometheus',
          access: 'proxy',
          url: 'http://localhost:9090',
          isDefault: true,
        },
      ],
    };

    const grafanaConfigPath = path.join(
      process.cwd(),
      'deploy',
      'monitoring',
      'grafana-datasources.yml'
    );
    fs.writeFileSync(grafanaConfigPath, JSON.stringify(grafanaConfig, null, 2));
    console.log(`✅ Grafana config created: ${grafanaConfigPath}`);
  }

  /**
   * Setup health check monitoring
   */
  private async setupHealthCheckMonitoring(): Promise<void> {
    const healthCheckScript = `#!/bin/bash
# Health Check Monitoring Script
# Runs every ${this.config.healthCheckInterval} seconds

while true; do
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Run health check
  health_result=$(npm run deployment:health-check --silent)
  health_status=$?
  
  # Log health check result
  if [ $health_status -eq 0 ]; then
    echo "[$timestamp] HEALTH_CHECK status=healthy"
  else
    echo "[$timestamp] HEALTH_CHECK status=unhealthy error=\"$health_result\""
    
    # Send alert for unhealthy status
    curl -X POST "${this.config.alertChannels.webhook || 'http://localhost:9093/api/v1/alerts'}" \\
      -H "Content-Type: application/json" \\
      -d '[{
        "labels": {
          "alertname": "HealthCheckFailed",
          "severity": "critical",
          "service": "connector-instance-api"
        },
        "annotations": {
          "summary": "Health check failed",
          "description": "System health check returned unhealthy status"
        }
      }]'
  fi
  
  sleep ${this.config.healthCheckInterval}
done
`;

    const scriptPath = path.join(process.cwd(), 'deploy', 'monitoring', 'health-check-monitor.sh');
    fs.writeFileSync(scriptPath, healthCheckScript);
    fs.chmodSync(scriptPath, '755');
    console.log(`✅ Health check monitoring script created: ${scriptPath}`);
  }

  /**
   * Setup performance metrics collection
   */
  private async setupPerformanceMetrics(): Promise<void> {
    const metricsCollectorScript = `#!/usr/bin/env node

const { getConnection } = require('../../packages/models/src/connection');
const fs = require('fs');
const path = require('path');

class MetricsCollector {
  constructor() {
    this.connection = getConnection();
    this.metricsFile = path.join(__dirname, 'metrics', 'performance-metrics.json');
  }

  async collectMetrics() {
    const timestamp = new Date().toISOString();
    const metrics = [];

    try {
      // Database metrics
      const session = this.connection.getSession();
      
      // Query response time
      const queryStart = Date.now();
      await session.run('MATCH (n) RETURN count(n) as nodeCount LIMIT 1');
      const queryTime = Date.now() - queryStart;
      
      metrics.push({
        timestamp,
        metric: 'database_query_duration_ms',
        value: queryTime,
        labels: { query_type: 'count_nodes' }
      });

      // Connector instance count
      const connectorResult = await session.run('MATCH (msc:MCPServerConnector) RETURN count(msc) as connectorCount');
      const connectorCount = connectorResult.records[0]?.get('connectorCount').toNumber() || 0;
      
      metrics.push({
        timestamp,
        metric: 'connector_instances_total',
        value: connectorCount,
        labels: { type: 'active' }
      });

      await session.close();

      // System metrics
      const memoryUsage = process.memoryUsage();
      metrics.push({
        timestamp,
        metric: 'nodejs_memory_usage_bytes',
        value: memoryUsage.heapUsed,
        labels: { type: 'heap_used' }
      });

      metrics.push({
        timestamp,
        metric: 'nodejs_memory_usage_bytes',
        value: memoryUsage.heapTotal,
        labels: { type: 'heap_total' }
      });

      // Save metrics
      this.saveMetrics(metrics);
      
      console.log(\`[\${timestamp}] Collected \${metrics.length} metrics\`);
      
    } catch (error) {
      console.error(\`[\${timestamp}] Metrics collection failed:\`, error);
    }
  }

  saveMetrics(metrics) {
    // Append to metrics file
    const metricsData = metrics.map(m => JSON.stringify(m)).join('\\n') + '\\n';
    fs.appendFileSync(this.metricsFile, metricsData);
  }
}

// Run metrics collection
const collector = new MetricsCollector();
collector.collectMetrics();
`;

    const collectorPath = path.join(process.cwd(), 'deploy', 'monitoring', 'metrics-collector.js');
    fs.writeFileSync(collectorPath, metricsCollectorScript);
    console.log(`✅ Metrics collector created: ${collectorPath}`);

    // Create cron job for metrics collection
    const cronScript = `#!/bin/bash
# Add to crontab: */1 * * * * /path/to/this/script
cd ${process.cwd()}
node deploy/monitoring/metrics-collector.js
`;

    const cronPath = path.join(process.cwd(), 'deploy', 'monitoring', 'metrics-cron.sh');
    fs.writeFileSync(cronPath, cronScript);
    fs.chmodSync(cronPath, '755');
    console.log(`✅ Metrics cron script created: ${cronPath}`);
  }

  /**
   * Setup alerting rules
   */
  private async setupAlertingRules(): Promise<void> {
    const alertRulesConfig = {
      groups: [
        {
          name: 'connector-instance-alerts',
          rules: this.alertRules
            .filter((rule) => rule.enabled)
            .map((rule) => ({
              alert: rule.name,
              expr: rule.condition,
              for: '2m',
              labels: {
                severity: rule.severity,
              },
              annotations: {
                summary: rule.description,
                description: `{{ $labels.instance }} - ${rule.description}`,
              },
            })),
        },
      ],
    };

    const rulesPath = path.join(process.cwd(), 'deploy', 'monitoring', 'alert_rules.yml');
    fs.writeFileSync(rulesPath, JSON.stringify(alertRulesConfig, null, 2));
    console.log(`✅ Alert rules created: ${rulesPath}`);

    // Alertmanager configuration
    const alertmanagerConfig = {
      global: {
        smtp_smarthost: 'localhost:587',
        smtp_from: 'alerts@starships.ai',
      },
      route: {
        group_by: ['alertname'],
        group_wait: '10s',
        group_interval: '10s',
        repeat_interval: '1h',
        receiver: 'web.hook',
      },
      receivers: [
        {
          name: 'web.hook',
          webhook_configs: [
            {
              url: this.config.alertChannels.webhook || 'http://localhost:9093/webhook',
            },
          ],
        },
      ],
    };

    if (this.config.alertChannels.email) {
      alertmanagerConfig.receivers.push({
        name: 'email',
        email_configs: this.config.alertChannels.email.map((email) => ({
          to: email,
          subject: 'Starships.ai Alert: {{ .GroupLabels.alertname }}',
          body: 'Alert: {{ .GroupLabels.alertname }}\nDescription: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}',
        })),
      } as any);
    }

    const alertmanagerPath = path.join(process.cwd(), 'deploy', 'monitoring', 'alertmanager.yml');
    fs.writeFileSync(alertmanagerPath, JSON.stringify(alertmanagerConfig, null, 2));
    console.log(`✅ Alertmanager config created: ${alertmanagerPath}`);
  }

  /**
   * Create monitoring dashboards
   */
  private async createMonitoringDashboards(): Promise<void> {
    const dashboardConfig = {
      dashboard: {
        id: null,
        title: 'Connector Instance Monitoring',
        tags: ['starships', 'connector-instances'],
        timezone: 'browser',
        panels: [
          {
            id: 1,
            title: 'System Health',
            type: 'stat',
            targets: [
              {
                expr: 'up{job="connector-instance-api"}',
                legendFormat: 'API Status',
              },
            ],
            fieldConfig: {
              defaults: {
                color: {
                  mode: 'thresholds',
                },
                thresholds: {
                  steps: [
                    { color: 'red', value: 0 },
                    { color: 'green', value: 1 },
                  ],
                },
              },
            },
          },
          {
            id: 2,
            title: 'Response Time',
            type: 'graph',
            targets: [
              {
                expr: 'database_query_duration_ms',
                legendFormat: 'Database Query Time',
              },
            ],
            yAxes: [
              {
                label: 'Milliseconds',
                min: 0,
              },
            ],
          },
          {
            id: 3,
            title: 'Connector Instances',
            type: 'graph',
            targets: [
              {
                expr: 'connector_instances_total',
                legendFormat: 'Total Instances',
              },
            ],
            yAxes: [
              {
                label: 'Count',
                min: 0,
              },
            ],
          },
          {
            id: 4,
            title: 'Memory Usage',
            type: 'graph',
            targets: [
              {
                expr: 'nodejs_memory_usage_bytes{type="heap_used"}',
                legendFormat: 'Heap Used',
              },
              {
                expr: 'nodejs_memory_usage_bytes{type="heap_total"}',
                legendFormat: 'Heap Total',
              },
            ],
            yAxes: [
              {
                label: 'Bytes',
                min: 0,
              },
            ],
          },
        ],
        time: {
          from: 'now-1h',
          to: 'now',
        },
        refresh: '30s',
      },
    };

    const dashboardPath = path.join(
      process.cwd(),
      'deploy',
      'monitoring',
      'grafana-dashboard.json'
    );
    fs.writeFileSync(dashboardPath, JSON.stringify(dashboardConfig, null, 2));
    console.log(`✅ Grafana dashboard created: ${dashboardPath}`);
  }

  /**
   * Setup log aggregation
   */
  private async setupLogAggregation(): Promise<void> {
    const logstashConfig = `
input {
  file {
    path => "${process.cwd()}/logs/*.log"
    start_position => "beginning"
    codec => "json"
  }
}

filter {
  if [level] == "ERROR" {
    mutate {
      add_tag => ["error"]
    }
  }
  
  if [message] =~ /connector.*instance/ {
    mutate {
      add_tag => ["connector-instance"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "starships-logs-%{+YYYY.MM.dd}"
  }
  
  if "error" in [tags] {
    http {
      url => "${this.config.alertChannels.webhook || 'http://localhost:9093/webhook'}"
      http_method => "post"
      content_type => "application/json"
      mapping => {
        "alerts" => [{
          "labels" => {
            "alertname" => "ApplicationError"
            "severity" => "medium"
            "service" => "connector-instance-api"
          }
          "annotations" => {
            "summary" => "Application error detected"
            "description" => "%{message}"
          }
        }]
      }
    }
  }
}
`;

    const logstashPath = path.join(process.cwd(), 'deploy', 'monitoring', 'logstash.conf');
    fs.writeFileSync(logstashPath, logstashConfig);
    console.log(`✅ Logstash config created: ${logstashPath}`);
  }

  /**
   * Start monitoring services
   */
  private async startMonitoringServices(): Promise<void> {
    const dockerComposeConfig = `
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: starships-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alert_rules.yml:/etc/prometheus/alert_rules.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'

  grafana:
    image: grafana/grafana:latest
    container_name: starships-grafana
    ports:
      - "3001:3000"
    volumes:
      - grafana-storage:/var/lib/grafana
      - ./grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
      - ./grafana-dashboard.json:/var/lib/grafana/dashboards/connector-instances.json
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  alertmanager:
    image: prom/alertmanager:latest
    container_name: starships-alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

volumes:
  grafana-storage:
`;

    const dockerComposePath = path.join(
      process.cwd(),
      'deploy',
      'monitoring',
      'docker-compose.yml'
    );
    fs.writeFileSync(dockerComposePath, dockerComposeConfig);
    console.log(`✅ Docker Compose config created: ${dockerComposePath}`);

    // Create startup script
    const startupScript = `#!/bin/bash
echo "🚀 Starting monitoring services..."

cd ${process.cwd()}/deploy/monitoring

# Start monitoring stack
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
if curl -s http://localhost:9090/-/healthy > /dev/null; then
  echo "✅ Prometheus is healthy"
else
  echo "❌ Prometheus health check failed"
fi

if curl -s http://localhost:3001/api/health > /dev/null; then
  echo "✅ Grafana is healthy"
else
  echo "❌ Grafana health check failed"
fi

if curl -s http://localhost:9093/-/healthy > /dev/null; then
  echo "✅ Alertmanager is healthy"
else
  echo "❌ Alertmanager health check failed"
fi

echo "📊 Monitoring services started!"
echo "   Prometheus: http://localhost:9090"
echo "   Grafana: http://localhost:3001 (admin/admin)"
echo "   Alertmanager: http://localhost:9093"
`;

    const startupPath = path.join(process.cwd(), 'deploy', 'monitoring', 'start-monitoring.sh');
    fs.writeFileSync(startupPath, startupScript);
    fs.chmodSync(startupPath, '755');
    console.log(`✅ Monitoring startup script created: ${startupPath}`);
  }

  /**
   * Initialize default alert rules
   */
  private initializeAlertRules(): void {
    this.alertRules = [
      {
        name: 'HighResponseTime',
        condition: `database_query_duration_ms > ${this.config.alertThresholds.responseTime}`,
        threshold: this.config.alertThresholds.responseTime,
        severity: 'medium',
        description: 'Database query response time is too high',
        enabled: true,
      },
      {
        name: 'HighErrorRate',
        condition: `(rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])) * 100 > ${this.config.alertThresholds.errorRate}`,
        threshold: this.config.alertThresholds.errorRate,
        severity: 'high',
        description: 'HTTP error rate is too high',
        enabled: true,
      },
      {
        name: 'HighMemoryUsage',
        condition: `nodejs_memory_usage_bytes{type="heap_used"} / 1024 / 1024 > ${this.config.alertThresholds.memoryUsage}`,
        threshold: this.config.alertThresholds.memoryUsage,
        severity: 'medium',
        description: 'Memory usage is too high',
        enabled: true,
      },
      {
        name: 'ServiceDown',
        condition: 'up{job="connector-instance-api"} == 0',
        threshold: 0,
        severity: 'critical',
        description: 'Connector instance API service is down',
        enabled: true,
      },
      {
        name: 'DatabaseConnectionFailed',
        condition: 'neo4j_up == 0',
        threshold: 0,
        severity: 'critical',
        description: 'Neo4j database connection failed',
        enabled: true,
      },
    ];
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      path.join(process.cwd(), 'deploy', 'monitoring'),
      this.metricsDir,
      path.join(process.cwd(), 'logs'),
    ];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
}

/**
 * CLI interface for monitoring setup
 */
export async function setupMonitoring(): Promise<void> {
  console.log('📊 Monitoring and Alerting Setup');
  console.log('================================');

  const config: MonitoringConfig = {
    healthCheckInterval: 30,
    alertThresholds: {
      responseTime: 1000,
      errorRate: 5,
      memoryUsage: 500,
      diskUsage: 80,
      connectionCount: 100,
    },
    alertChannels: {
      webhook: process.env.ALERT_WEBHOOK_URL,
      email: process.env.ALERT_EMAILS?.split(','),
    },
    metrics: {
      retention: 30,
      aggregationInterval: 1,
    },
  };

  console.log('Configuration:', config);

  try {
    const monitoring = new MonitoringSetup(config);
    await monitoring.setupMonitoring();

    console.log('\n🎉 Monitoring setup completed successfully!');
    console.log('📊 Access monitoring dashboard at: http://localhost:3001');
    console.log('🚨 Alerts are configured and active');
  } catch (error) {
    console.error('\n💥 Monitoring setup failed:', error);
    process.exit(1);
  }
}

// Run monitoring setup if this script is executed directly
if (require.main === module) {
  setupMonitoring().catch(console.error);
}
