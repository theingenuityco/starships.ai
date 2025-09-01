#!/usr/bin/env node

/**
 * Status Data Update Script
 * Manages the status.json file with rolling 30-day history
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DATA_RETENTION_DAYS = 30;
const STATUS_FILE = path.join(__dirname, '../../status-page/data/status.json');
const HISTORY_FILE = path.join(__dirname, '../../status-page/data/history.json');

// Ensure directories exist
function ensureDirectories() {
    const dirs = [
        path.join(__dirname, '../../status-page'),
        path.join(__dirname, '../../status-page/data')
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
}

// Load existing data or create new
function loadStatusData() {
    if (fs.existsSync(STATUS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        } catch (error) {
            console.error('Error reading status file, creating new:', error.message);
        }
    }
    
    // Default structure
    return {
        metadata: {
            version: '1.0.0',
            lastUpdate: new Date().toISOString(),
            dataRetentionDays: DATA_RETENTION_DAYS
        },
        services: {
            production: {
                name: 'Starships.ai Production',
                url: process.env.PROD_URL,
                endpoint: '/health',
                current: {
                    status: 'unknown',
                    lastCheck: null,
                    responseTime: null,
                    details: {}
                },
                uptime: {
                    '24h': 0,
                    '7d': 0,
                    '30d': 0
                },
                incidents: {
                    active: [],
                    recent: []
                }
            },
            development: {
                name: 'Starships.ai Development',
                url: process.env.DEV_URL,
                endpoint: '/health',
                current: {
                    status: 'unknown',
                    lastCheck: null,
                    responseTime: null,
                    details: {}
                },
                uptime: {
                    '24h': 0,
                    '7d': 0,
                    '30d': 0
                },
                incidents: {
                    active: [],
                    recent: []
                }
            }
        },
        history: []
    };
}

// Update service status
function updateServiceStatus(data, environment, checkResult) {
    const service = data.services[environment];
    const previousStatus = service.current.status;
    
    // Update current status
    service.current = {
        status: checkResult.status,
        lastCheck: new Date().toISOString(),
        responseTime: checkResult.responseTime,
        details: checkResult.details || {}
    };
    
    // Update URL if provided
    if (checkResult.url) {
        service.url = checkResult.url;
    }
    
    // Handle incident tracking
    if (checkResult.status !== 'operational' && previousStatus === 'operational') {
        // New incident
        const incident = {
            id: `incident-${Date.now()}`,
            startTime: new Date().toISOString(),
            type: checkResult.status,
            description: checkResult.error || 'Service degradation detected'
        };
        service.incidents.active.push(incident);
        
    } else if (checkResult.status === 'operational' && previousStatus !== 'operational') {
        // Incident resolved
        const activeIncident = service.incidents.active.shift();
        if (activeIncident) {
            activeIncident.endTime = new Date().toISOString();
            activeIncident.duration = Date.now() - new Date(activeIncident.startTime).getTime();
            service.incidents.recent.unshift(activeIncident);
            
            // Keep only last 10 incidents
            service.incidents.recent = service.incidents.recent.slice(0, 10);
        }
    }
    
    return data;
}

// Add entry to history
function addHistoryEntry(data, checks) {
    const entry = {
        timestamp: new Date().toISOString(),
        checks: {}
    };
    
    // Add check results for each environment
    Object.keys(checks).forEach(env => {
        entry.checks[env] = {
            status: checks[env].status === 'operational' ? 'up' : 'down',
            responseTime: checks[env].responseTime,
            statusCode: checks[env].statusCode,
            services: checks[env].services || {}
        };
    });
    
    // Add to history
    data.history.unshift(entry);
    
    // Trim old history
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DATA_RETENTION_DAYS);
    
    data.history = data.history.filter(entry => 
        new Date(entry.timestamp) > cutoffDate
    );
    
    return data;
}

// Calculate uptime percentages
function calculateUptime(data) {
    const now = new Date();
    
    Object.keys(data.services).forEach(env => {
        const service = data.services[env];
        
        // Calculate for different periods
        const periods = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        
        Object.keys(periods).forEach(period => {
            const cutoff = new Date(now - periods[period]);
            const relevantHistory = data.history.filter(entry => 
                new Date(entry.timestamp) > cutoff && entry.checks[env]
            );
            
            if (relevantHistory.length === 0) {
                service.uptime[period] = 0;
                return;
            }
            
            const upCount = relevantHistory.filter(entry => 
                entry.checks[env].status === 'up'
            ).length;
            
            service.uptime[period] = parseFloat(
                ((upCount / relevantHistory.length) * 100).toFixed(2)
            );
        });
    });
    
    return data;
}

// Main update function
function updateStatus(checkResults) {
    ensureDirectories();
    
    let data = loadStatusData();
    
    // Update service statuses
    Object.keys(checkResults).forEach(env => {
        data = updateServiceStatus(data, env, checkResults[env]);
    });
    
    // Add to history
    data = addHistoryEntry(data, checkResults);
    
    // Calculate uptime
    data = calculateUptime(data);
    
    // Update metadata
    data.metadata.lastUpdate = new Date().toISOString();
    
    // Save data
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
    console.log(`Status data updated: ${STATUS_FILE}`);
    
    // Also save compact history file
    const historyData = {
        lastUpdate: data.metadata.lastUpdate,
        entries: data.history
    };
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 2));
    
    return data;
}

// CLI usage
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node update-status-data.js <environment> <status> <responseTime> [statusCode]');
        console.log('Example: node update-status-data.js production operational 145 200');
        process.exit(1);
    }
    
    const [environment, status, responseTime, statusCode] = args;
    
    const checkResults = {
        [environment]: {
            status,
            responseTime: parseInt(responseTime) || 0,
            statusCode: parseInt(statusCode) || 200,
            url: process.env[`${environment.toUpperCase()}_URL`]
        }
    };
    
    updateStatus(checkResults);
}

module.exports = { updateStatus, loadStatusData, calculateUptime };