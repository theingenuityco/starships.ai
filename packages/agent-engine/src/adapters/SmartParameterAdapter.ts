/**
 * SmartParameterAdapter - Intelligent parameter mapping for MCP tools
 * 
 * Replaces 600+ lines of hardcoded parameter mappings with smart heuristics
 * and pattern memory stored in Neo4j.
 */

import { Neo4jConnection } from '@starships/models';
import { MCPTool } from '@starships/core';
import { createHash } from 'crypto';
import { HeuristicRules } from './HeuristicRules';
import { PatternMemory } from './PatternMemory';
import * as fs from 'fs';

export class SmartParameterAdapter {
  private heuristics: HeuristicRules;
  private patternMemory: PatternMemory;
  private overrides: Map<string, any> = new Map();
  private stats = {
    cacheHits: 0,
    heuristicHits: 0,
    overrideHits: 0,
    totalCalls: 0
  };
  private debugMode = process.env.SMART_ADAPTER_LOG_LEVEL === 'debug';
  private recentTransformations: any[] = [];

  constructor(private neo4j: Neo4jConnection) {
    this.heuristics = new HeuristicRules();
    this.patternMemory = new PatternMemory(neo4j);
    this.loadOverrides();
  }

  async adapt(input: any, tool: MCPTool): Promise<any> {
    this.stats.totalCalls++;
    const startTime = Date.now();
    
    const transformation: any = {
      toolName: tool.name,
      timestamp: Date.now(),
      input: this.debugMode ? input : '[hidden]',
      steps: [] as any[],
      output: null
    };
    
    try {
      // Step 1: Check for manual overrides (highest priority)
      const override = this.checkOverride(tool, input);
      if (override) {
        console.log(`[SmartAdapter] Override hit for ${tool.name}`);
        this.stats.overrideHits++;
        transformation.steps.push({ type: 'override', result: override });
        transformation.output = override;
        this.recordTransformation(transformation, startTime);
        return override;
      }

      // Step 2: Check Neo4j pattern cache
      const cachedPattern = await this.patternMemory.getPattern(tool.templateSlug, tool.name, input);
      if (cachedPattern) {
        console.log(`[SmartAdapter] Cache hit for ${tool.name} (${Date.now() - startTime}ms)`);
        this.stats.cacheHits++;
        transformation.steps.push({ type: 'cache', result: cachedPattern });
        transformation.output = cachedPattern;
        this.recordTransformation(transformation, startTime);
        return cachedPattern;
      }

      // Step 3: Apply heuristic rules
      const transformed = this.heuristics.apply(input, tool);
      console.log(`[SmartAdapter] Heuristic transformation for ${tool.name} (${Date.now() - startTime}ms)`);
      this.stats.heuristicHits++;
      transformation.steps.push({ type: 'heuristic', rules: this.heuristics.getAppliedRules() });

      // Step 4: Save successful pattern (async, don't wait)
      this.patternMemory.savePattern(tool.templateSlug, tool.name, input, transformed).catch(err => {
        console.error('[SmartAdapter] Failed to save pattern:', err);
      });

      transformation.output = transformed;
      this.recordTransformation(transformation, startTime);
      return transformed;
    } catch (error) {
      console.error(`[SmartAdapter] Error adapting parameters for ${tool.name}:`, error);
      transformation.steps.push({ type: 'error', error: error instanceof Error ? error.message : String(error) });
      transformation.output = input;
      this.recordTransformation(transformation, startTime);
      // Fallback: return original input
      return input;
    }
  }

  private recordTransformation(transformation: any, startTime: number) {
    transformation.duration = Date.now() - startTime;
    
    // Keep last 100 transformations for debugging
    this.recentTransformations.unshift(transformation);
    this.recentTransformations = this.recentTransformations.slice(0, 100);
    
    if (this.debugMode) {
      console.log('[SmartAdapter] Transformation:', JSON.stringify(transformation, null, 2));
    }
  }

  private checkOverride(tool: MCPTool, input: any): any | null {
    const key = `${tool.templateSlug}_${tool.name}`;
    if (this.overrides.has(key)) {
      const override = this.overrides.get(key);
      return this.applyOverride(input, override);
    }
    return null;
  }

  private applyOverride(input: any, override: any): any {
    // Apply YAML-defined transformation
    if (override.match && override.transform) {
      // Simple field mapping
      const result = { ...input };
      for (const [field, value] of Object.entries(input)) {
        if (field === override.match) {
          result[override.transform] = value;
          delete result[field];
        }
      }
      return result;
    }
    return input;
  }

  private loadOverrides() {
    try {
      const configPath = process.env.PARAM_OVERRIDES_PATH || 'config/parameter-overrides.yaml';
      if (fs.existsSync(configPath)) {
        // For now, skip YAML loading since js-yaml is not available
        // In production, this would load the YAML config
        console.log(`[SmartAdapter] Override config found at ${configPath} (YAML loading disabled in test)`);
      }
    } catch (error) {
      console.error('[SmartAdapter] Failed to load overrides:', error);
    }
  }

  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.totalCalls > 0 
        ? (this.stats.cacheHits / this.stats.totalCalls * 100).toFixed(2) + '%'
        : '0%',
      heuristicHitRate: this.stats.totalCalls > 0
        ? (this.stats.heuristicHits / this.stats.totalCalls * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  getRecentTransformations(limit: number = 10) {
    return this.recentTransformations.slice(0, limit);
  }

  getLastTransformationSteps() {
    return this.recentTransformations[0]?.steps || [];
  }
}