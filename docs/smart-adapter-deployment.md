# Smart Parameter Adapter Deployment Guide

## 🚀 Deployment Status: READY FOR STAGING

### ✅ Completed Items

1. **Core Implementation** ✅
   - SmartParameterAdapter.ts implemented
   - HeuristicRules.ts with 10 smart rules
   - PatternMemory.ts for Neo4j storage
   - All core functionality tested

2. **Neo4j Integration** ✅
   - Migration script created and tested
   - Indexes created for performance
   - Pattern storage working
   - Connection pooling configured

3. **Testing** ✅
   - Unit tests passing
   - Load test completed (1000 concurrent operations)
   - Performance meets targets for cached patterns

4. **Configuration** ✅
   - Feature flag system in place
   - Override YAML structure defined
   - Environment variables configured

### 🔄 Current Tasks

5. **Staging Deployment** 🟡 In Progress
   - Deploy with feature flag OFF
   - Enable for select test accounts
   - Monitor performance metrics
   - Collect pattern data

### 📝 Deployment Checklist

#### Pre-Deployment
- [x] Run Neo4j migration script
- [x] Verify indexes created
- [x] Test Neo4j connectivity
- [x] Load test passed
- [ ] Backup current MCPToolWrapper

#### Deployment Steps

1. **Set Environment Variables**
```bash
export USE_SMART_ADAPTER=false  # Start disabled
export SMART_ADAPTER_LOG_LEVEL=info
export PARAM_OVERRIDES_PATH=config/parameter-overrides.yaml
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=mcppassword
```

2. **Deploy Code**
```bash
# Deploy the adapter files
git add packages/agent-engine/src/adapters/
git commit -m "feat: Add Smart Parameter Adapter for MCP tools"
git push origin mcpMigrateKuberneetes
```

3. **Enable Feature Gradually**
```bash
# Stage 1: Test with single tool (10% traffic)
export USE_SMART_ADAPTER=true
export SMART_ADAPTER_TOOLS=notion  # Only for Notion initially

# Stage 2: Expand to more tools (50% traffic)
export SMART_ADAPTER_TOOLS=notion,github,brave

# Stage 3: Full rollout (100% traffic)
export SMART_ADAPTER_TOOLS=all
```

4. **Monitor Key Metrics**
- Cache hit rate (target: >60% after warmup)
- Average response time (target: <10ms for cached)
- Error rate (target: <0.1%)
- Pattern save success rate

### 📊 Monitoring Commands

```bash
# Check adapter stats
curl http://localhost:3000/api/debug/smart-adapter/stats

# View stored patterns
curl http://localhost:3000/api/debug/smart-adapter/patterns/notion_API-post-page

# Test specific transformation
curl -X POST http://localhost:3000/api/debug/smart-adapter/test \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"paragraph": {"text": "Test"}},
    "toolName": "API-post-page",
    "templateSlug": "notion"
  }'
```

### 🚨 Rollback Plan

If issues occur, rollback immediately:

```bash
# 1. Disable feature flag
export USE_SMART_ADAPTER=false

# 2. Restart service
pm2 restart agent-engine

# 3. Investigate issues
tail -f logs/agent-engine.log | grep SmartAdapter
```

### 📈 Success Criteria

The deployment is successful when:

1. **Performance**
   - P95 response time < 10ms for cached patterns
   - P99 response time < 50ms
   - Zero timeout errors

2. **Reliability**
   - Error rate < 0.1%
   - All MCP tools working correctly
   - No regression in functionality

3. **Efficiency**
   - Cache hit rate > 60% after 24 hours
   - Pattern storage < 100MB in Neo4j
   - CPU usage increase < 5%

### 🔍 Post-Deployment Validation

```bash
# 1. Run integration tests
npm run test:integration

# 2. Verify all MCP tools
for tool in notion github brave slack; do
  echo "Testing $tool..."
  npm run test:mcp -- --tool=$tool
done

# 3. Check pattern learning
neo4j-shell "MATCH (p:ParameterPattern) RETURN p.toolId, count(*) as patterns, avg(p.successCount) as avgSuccess"
```

### 📝 Notes

- The adapter learns from successful transformations
- Initial requests may be slower while patterns are learned
- Monitor Neo4j disk usage (patterns expire after 90 days)
- Override YAML only needed for edge cases

### 🎯 Next Steps After Deployment

1. **Week 1**: Monitor and tune heuristics
2. **Week 2**: Analyze pattern data, optimize rules
3. **Month 1**: Remove legacy code after stability confirmed
4. **Month 2**: Share learnings, expand to other systems

### 💡 Tips for Success

- Start with low traffic to build pattern cache
- Monitor logs closely first 24 hours
- Keep override YAML minimal (5-10 rules max)
- Document any new patterns discovered

### 📞 Support

If issues arise:
1. Check logs: `grep SmartAdapter logs/*.log`
2. Review patterns: Check Neo4j for unusual patterns
3. Disable if needed: Set `USE_SMART_ADAPTER=false`

---

**Last Updated**: 2024-08-15
**Version**: 1.0.0
**Status**: Ready for Staging Deployment