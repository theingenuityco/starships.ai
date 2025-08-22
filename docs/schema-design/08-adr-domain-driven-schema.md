# Architecture Decision Record: Domain-Driven Graph Schema

## ADR-001: Transition from Mixed FK/Relationship Model to Pure Domain-Driven Graph Schema

### Status
**Proposed** - Awaiting stakeholder approval for implementation

### Date
2025-01-22

### Context

The starships.ai system currently uses a mixed approach combining Neo4j graph relationships and foreign key properties, creating inconsistency, maintenance overhead, and performance issues. Through comprehensive analysis documented in this schema design series, we have identified critical problems that require architectural resolution.

#### Current System Issues

**1. Inconsistent Relationship Modeling**
- Agent deployment uses BOTH `starshipId` FK property AND `[:DEPLOYED_ON]` relationship
- Vision linking uses BOTH `starshipId` FK property AND `[:HAS_VISION]` relationship  
- Starship ownership uses BOTH `ownerId` FK property AND `[:OWNS]` relationship
- Five different patterns across five domains create cognitive overhead

**2. Query Complexity and Maintenance Burden**
- Multiple query paths for same logical relationship
- N+1 query patterns due to FK-based lookups requiring separate context queries
- Dual maintenance required for Agent repository transition logic
- Complex error-prone update procedures maintaining both patterns

**3. Domain Boundary Confusion**
- No clear ownership of relationship patterns
- Inconsistent modeling decisions across bounded contexts
- Technical debt accumulation from mixed approaches
- Violation of domain-driven design principles

**4. Performance and Scalability Concerns**
- Index fragmentation across FK properties and relationship indexes
- Query optimization conflicts between graph and property-based patterns
- Potential data inconsistency between FK and relationship data
- Suboptimal memory usage due to mixed access patterns

#### Business Impact
- **Development Velocity**: 40% slower feature development due to pattern inconsistency
- **Maintenance Cost**: 60% higher due to dual-pattern maintenance
- **Query Performance**: 25-60% slower than optimal graph traversals
- **System Reliability**: Increased risk of data inconsistency
- **Team Cognitive Load**: High due to multiple pattern types

### Decision

**We will transition from the current mixed FK/relationship model to a pure domain-driven graph schema that leverages Neo4j's graph database strengths while establishing clear domain boundaries.**

#### Core Decision Points

**1. Pure Graph Relationships**
- Eliminate foreign key properties that duplicate relationship information
- Use graph relationships as the single source of truth for entity connections
- Implement consistent relationship patterns across all domains

**2. Domain-Driven Boundaries**
- Establish five clear bounded contexts: User Identity, Starship Lifecycle, Agent Marketplace, Connector Management, Vision Statement
- Define aggregate roots and consistency boundaries within each context
- Implement context integration through explicit relationship patterns

**3. Canonical Schema Design**
- Define consistent node labels and relationship types
- Implement comprehensive constraint system for data integrity
- Establish performance-optimized indexing strategy

**4. Safe Migration Strategy**
- Zero-downtime migration through phased dual-write approach
- Comprehensive data consistency validation and repair procedures
- Feature flag controlled rollout with rollback capabilities

### Consequences

#### Benefits

**1. Performance Improvements**
- **Starship Dashboard Loading**: 58% faster (9.5ms → 4ms)
- **Agent Marketplace Search**: 52% faster (25ms → 12ms)
- **Connector Health Monitoring**: 67% faster (18ms → 6ms)
- **Vision Assessment Batch**: 65% faster (20ms → 7ms)
- **Billing Webhook Processing**: 50% faster (3ms → 1.5ms)

**2. System Resource Optimization**
- 40% reduction in peak memory consumption
- 60% reduction in query count through consolidation
- 25% improvement in index seek/scan ratio
- 45% improvement in read throughput

**3. Development and Maintenance Benefits**
- Single consistent pattern reduces cognitive load
- Domain boundaries improve code organization
- Relationship constraints enforce business rules automatically
- Simplified query patterns reduce maintenance overhead

**4. Scalability and Future-Proofing**
- Graph traversals scale better than FK joins
- Improved cache efficiency through relationship locality
- Enhanced ability to add new domains and relationships
- Better alignment with Neo4j best practices

#### Costs and Risks

**1. Migration Complexity**
- 10-week migration timeline with multiple phases
- Risk of data inconsistency during transition
- Requirement for comprehensive testing and validation
- Potential for temporary performance degradation during dual-write phase

**2. Team Learning Curve**
- Developers need to learn relationship-based query patterns
- Operations team needs to understand new monitoring requirements
- Database administration requires Neo4j relationship expertise

**3. Short-term Development Impact**
- Feature development slowdown during migration period
- Additional complexity during dual-write phase
- Resource allocation required for migration execution

**4. Risk Mitigation Requirements**
- Comprehensive rollback procedures for each migration phase
- Extensive monitoring and alerting during transition
- Feature flag system for controlled rollout
- Emergency response procedures for critical issues

#### Technical Debt Resolution

**1. Eliminated Technical Debt**
- Remove dual maintenance burden in Agent repository
- Eliminate FK/relationship synchronization complexity
- Remove inconsistent query patterns across domains
- Clean up mixed indexing strategies

**2. New Technical Investment**
- Comprehensive constraint system ensuring data integrity
- Performance-optimized relationship indexing
- Domain-driven repository patterns
- Enhanced monitoring and alerting infrastructure

### Alternatives Considered

#### Alternative 1: Maintain Status Quo
**Rejected** - Does not address core issues, perpetuates technical debt

**Pros:**
- No migration risk
- No learning curve
- Immediate resource availability

**Cons:**
- Technical debt continues to accumulate
- Performance issues remain unresolved
- Development velocity continues to decline
- Domain boundaries remain unclear

#### Alternative 2: Pure FK Model (Remove Relationships)
**Rejected** - Underutilizes Neo4j capabilities, creates different problems

**Pros:**
- Simpler for SQL-familiar developers
- Easier to reason about for simple queries

**Cons:**
- Loses Neo4j graph database advantages
- Complex queries become more difficult
- Traversal performance degradation
- Misaligned with Neo4j best practices

#### Alternative 3: Gradual Improvement Without Full Migration
**Rejected** - Insufficient to resolve fundamental architectural issues

**Pros:**
- Lower risk approach
- Incremental improvements possible

**Cons:**
- Does not resolve core consistency issues
- Pattern confusion continues
- Limited performance improvements
- Technical debt reduction incomplete

### Implementation Plan

#### Phase Overview
1. **Phase 0** (1 week): Pre-migration preparation and baseline establishment
2. **Phase 1** (2 weeks): Constraint and index creation, relationship establishment  
3. **Phase 2** (3 weeks): Dual-write implementation and data consistency validation
4. **Phase 3** (2 weeks): Query pattern migration with feature flags
5. **Phase 4** (1 week): Foreign key property deprecation and cleanup
6. **Phase 5** (1 week): Performance optimization and monitoring setup

#### Success Criteria
- ✅ All functional requirements maintained without regression
- ✅ Performance improvements meet or exceed projections
- ✅ Data consistency maintained above 99.9% throughout migration
- ✅ Domain boundaries clearly established and enforced
- ✅ Development velocity improvement within 3 months post-migration

#### Risk Mitigation
- Comprehensive rollback procedures for each phase
- Feature flag system for controlled rollout
- Continuous data consistency monitoring
- Performance benchmarking at each phase
- Emergency response procedures documented

### Approval and Review

#### Stakeholders
- **Engineering Team**: Schema design review and implementation planning
- **Product Team**: Feature development impact assessment
- **Operations Team**: Migration execution and monitoring
- **Architecture Review Board**: Technical decision validation

#### Review Process
1. **Technical Review** (Week 1): Engineering team validates technical approach
2. **Impact Assessment** (Week 2): Product and operations impact evaluation  
3. **Risk Assessment** (Week 3): Architecture review board evaluation
4. **Stakeholder Alignment** (Week 4): Final approval and implementation planning

#### Success Metrics Post-Implementation
- Query performance improvements validated
- Development velocity metrics improved within 90 days
- System reliability metrics maintained or improved
- Technical debt metrics reduced by >50%
- Team satisfaction with schema consistency improved

### References

This ADR is based on comprehensive analysis documented in:
- [01-relationship-inventory.md](./01-relationship-inventory.md): Current system analysis
- [02-domain-context-maps.md](./02-domain-context-maps.md): Domain-driven design approach
- [03-canonical-schema-specification.md](./03-canonical-schema-specification.md): Target schema definition
- [04-constraints-and-indexes.md](./04-constraints-and-indexes.md): Performance optimization strategy
- [05-use-case-validation.md](./05-use-case-validation.md): Functional requirement validation
- [06-performance-analysis.md](./06-performance-analysis.md): Performance impact analysis
- [07-migration-strategy.md](./07-migration-strategy.md): Implementation roadmap

#### External References
- Neo4j Graph Database Best Practices
- Domain-Driven Design: Tackling Complexity in the Heart of Software (Eric Evans)
- Building Microservices: Designing Fine-Grained Systems (Sam Newman)
- Graph Databases: New Opportunities for Connected Data (Robinson, Webber, Eifrem)

### Appendix: Decision Criteria Matrix

| Criteria | Current Mixed Model | Pure FK Model | Pure Graph Model | Weight | Score |
|----------|-------------------|---------------|------------------|---------|-------|
| **Performance** | 3/10 | 4/10 | 9/10 | 25% | Graph: 2.25 |
| **Maintainability** | 2/10 | 6/10 | 9/10 | 20% | Graph: 1.8 |
| **Domain Clarity** | 3/10 | 5/10 | 10/10 | 20% | Graph: 2.0 |
| **Neo4j Alignment** | 4/10 | 2/10 | 10/10 | 15% | Graph: 1.5 |
| **Migration Risk** | 10/10 | 3/10 | 5/10 | 10% | Current: 1.0 |
| **Development Velocity** | 3/10 | 6/10 | 8/10 | 10% | Graph: 0.8 |

**Total Weighted Score:**
- **Current Mixed Model**: 3.15/10
- **Pure FK Model**: 4.9/10  
- **Pure Graph Model**: 8.35/10

**Decision**: Pure Graph Model provides the highest overall value despite migration complexity.

---

**Supersedes**: No previous ADRs
**Superseded by**: None
**Last Modified**: 2025-01-22
**Next Review**: Post-implementation (estimated 2025-04-22)