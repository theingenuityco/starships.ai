# Expedition Feature Implementation Plan

## Overview
Implement a minimal yet elegant expedition management system for starships, allowing users to create expeditions with assigned agents and track expedition statistics.

## Architecture Overview

### 1. Data Layer (Neo4j Database)
- **Expedition Node**: Core entity storing expedition data
  - Properties: id, name, description, starshipId, status, createdAt, updatedAt
- **Relationships**:
  - `(Expedition)-[:BELONGS_TO]->(Starship)`
  - `(Agent)-[:ASSIGNED_TO]->(Expedition)`

### 2. Backend Implementation

#### Models & Repository Pattern
- `ExpeditionRepository`: CRUD operations following existing patterns
- Integration with existing connection management
- Support for agent assignment/unassignment

#### API Endpoints
- `POST /api/starships/:starshipId/expeditions` - Create expedition
- `GET /api/starships/:starshipId/expeditions` - List expeditions
- `GET /api/expeditions/:id` - Get expedition details
- `DELETE /api/expeditions/:id` - Delete expedition

### 3. Frontend Implementation

#### Component Structure
```
/components/expedition/
├── ExpeditionCreateModal.tsx    # Modal form for creating expeditions
├── ExpeditionCard.tsx          # Card component for displaying expeditions
├── ExpeditionDashboard.tsx     # Main dashboard with stats header
├── ExpeditionAgentSelector.tsx # Multi-select for agents
└── ExpeditionStats.tsx         # Stats display component
```

#### UI/UX Design Principles
- **Modern & Professional**: Following existing design patterns with glassmorphism effects
- **Card-based Layout**: Similar to StarshipCard with hover effects and smooth animations
- **Stats Header**: Clean metrics display showing expeditions, agents, and totals
- **Modal Forms**: Consistent with existing modals using shadcn/ui components

#### Data Fetching Pattern
- Direct API calls using axios (configured in `api.ts`)
- Simple component state with useState/useEffect
- Fresh data fetched on mount and after actions

### 4. Key Features

#### Expedition Creation
- Name and description fields
- Agent multi-selector showing only starship's agents
- Validation for required fields
- Success feedback with toast notifications

#### Dashboard View
- Grid layout for expedition cards
- Stats bar showing:
  - Total expeditions
  - Total assigned agents
  - Active expeditions
- Search and filter capabilities

#### Expedition Cards
- Display expedition name, description
- Show assigned agents with avatars
- Status indicator (active/inactive)
- Delete action only

### 5. Technical Considerations

#### Performance
- Pagination for large expedition lists
- Lazy loading of agent data
- Optimized queries with proper indexing

#### Security
- Authorization checks for starship ownership
- Validation of agent assignments
- Audit logging for expedition changes

#### Scalability
- Designed for future features:
  - Expedition missions/tasks
  - Progress tracking
  - Collaboration features
  - Analytics dashboard

### 6. Implementation Phases

**Phase 1: Core Backend**
- Database schema and migrations
- Repository implementation
- Basic CRUD endpoints

**Phase 2: Frontend Foundation**
- Create modal and form
- Card components
- Basic dashboard layout

**Phase 3: Integration**
- Connect frontend to API using axios
- Implement loading and error states
- Add success toast notifications

**Phase 4: Polish**
- Animations and transitions
- Error handling
- Loading states
- Toast notifications

### 7. File Structure

#### Backend Files
```
packages/models/src/
├── types.ts                        # Add Expedition interface
└── repositories/
    └── ExpeditionRepository.ts     # Repository implementation

packages/protocol/src/
└── types/
    └── expedition.ts               # Expedition types and interfaces

packages/server/src/
└── routes/
    └── expeditions.ts              # API endpoints
```

#### Frontend Files
```
packages/client/src/
├── components/
│   └── expedition/
│       ├── ExpeditionCreateModal.tsx
│       ├── ExpeditionCard.tsx
│       ├── ExpeditionDashboard.tsx
│       ├── ExpeditionAgentSelector.tsx
│       └── ExpeditionStats.tsx
├── lib/
│   └── expedition-api.ts           # API client functions
└── app/
    └── ship/
        └── [slug]/
            └── expeditions/
                └── page.tsx        # Expedition page
```

### 8. Implementation Notes

#### Database Schema
```cypher
// Expedition node
CREATE (e:Expedition {
  id: $id,
  name: $name,
  description: $description,
  starshipId: $starshipId,
  status: $status, // 'active' | 'inactive' | 'completed'
  createdAt: $createdAt,
  updatedAt: $updatedAt
})

// Relationships
CREATE (e:Expedition)-[:BELONGS_TO]->(s:Starship)
CREATE (a:Agent)-[:ASSIGNED_TO]->(e:Expedition)
```

#### Component Examples

**ExpeditionCard Design**
- Similar to StarshipCard with:
  - Avatar/icon for expedition
  - Name and description
  - Agent avatars (stacked)
  - Status badge
  - Delete button

**Stats Header Design**
- Clean horizontal layout
- Icon + metric + label
- Subtle background with border
- Responsive grid

This plan ensures a minimal yet professional implementation that integrates seamlessly with the existing starships.ai architecture while providing room for future enhancements.

## Analysis Results - Codebase Integration Requirements

### ✅ **Aligned with Codebase Patterns**
1. **Repository Pattern** - Correctly follows existing patterns (AgentRepository, StarshipRepository)
2. **API Structure** - Matches route patterns in `/packages/server/src/routes/`
3. **Auth Middleware** - Plan can leverage existing `authMiddleware` 
4. **Validation** - Can use existing validation middleware patterns
5. **Navigation** - Expedition route already exists in Navigation.tsx at line 35
6. **Component Structure** - Follows existing patterns (StarshipCard, modals, etc.)

### 🔴 **Required Integration Updates**

1. **Repository Factory Registration**
   - Add `ExpeditionRepository` to `RepositoryFactory` in `/packages/models/src/repositories/index.ts`
   - Add getter method `getExpeditionRepository()`
   - Include in initialization and health checks

2. **Type Exports**
   - Export `Expedition` interface from `/packages/models/src/types.ts`
   - Export `ExpeditionRepository` from `/packages/models/src/index.ts`

3. **Server Index Registration**
   ```typescript
   // In packages/server/src/index.ts
   import expeditionRoutes from './routes/expeditions';
   // Add to route registration
   app.use('/api', expeditionRoutes);
   ```

4. **Protocol Package Structure Update**
   ```
   packages/protocol/src/
   └── index.ts  # Add Expedition interfaces here directly (not in subdirectory)
   ```

5. **Toast Implementation**
   - Use existing `useToast` hook from `/hooks/useToast`
   - No need to create new toast system

### 📝 **Updated Implementation Notes**

1. **Navigation Already Exists** - Skip navigation creation, already present at `/ship/${starshipSlug}/expeditions`

2. **No State Store Needed** - Use direct API calls with useState/useEffect pattern

3. **Repository Factory Integration**:
   ```typescript
   // Add to RepositoryFactory class
   private static expeditionRepo: ExpeditionRepository | null = null;
   
   // In performInitialization()
   this.expeditionRepo = new ExpeditionRepository();
   
   // Add getter method
   static getExpeditionRepository(): ExpeditionRepository {
     this.ensureInitialized();
     if (!this.expeditionRepo) {
       throw new Error('ExpeditionRepository not initialized');
     }
     return this.expeditionRepo;
   }
   ```

4. **Import Updates**:
   ```typescript
   // packages/models/src/index.ts
   export { ExpeditionRepository } from './repositories/ExpeditionRepository';
   
   // packages/models/src/repositories/index.ts
   export { ExpeditionRepository } from './ExpeditionRepository';
   ```

## Detailed Ground-Level Analysis Results

### ✅ **No Major Blockers Found**
The expedition implementation plan is well-aligned with the codebase architecture. All necessary patterns and infrastructure exist.

### 🟡 **Minor Considerations & Adjustments**

1. **Multi-Select Component**
   - No existing multi-select UI component in the codebase
   - **Solution**: Build a simple checkbox list using existing `Checkbox` component
   - Reference: `AgentSelector` uses single selection pattern
   - Implementation approach:
   ```typescript
   // Custom multi-select using existing Checkbox component
   const AgentMultiSelect = ({ agents, selected, onChange }) => {
     return agents.map(agent => (
       <label key={agent.id} className="flex items-center space-x-2">
         <Checkbox 
           checked={selected.includes(agent.id)}
           onCheckedChange={(checked) => {
             if (checked) {
               onChange([...selected, agent.id])
             } else {
               onChange(selected.filter(id => id !== agent.id))
             }
           }}
         />
         <span>{agent.name}</span>
       </label>
     ))
   }
   ```

2. **Repository Must Extend BaseRepository**
   - All repositories must extend `BaseRepository` from `/packages/models/src/repositories/BaseRepository.ts`
   - Provides standardized error handling with `ErrorFactory`
   - Example implementation:
   ```typescript
   import { BaseRepository } from './BaseRepository';
   import { getConnection } from '../connection';
   
   export class ExpeditionRepository extends BaseRepository {
     constructor() {
       super('expedition'); // service name for error context
     }
     
     async create(data: CreateExpeditionData): Promise<Expedition> {
       return this.executeWithErrorHandling(
         async () => {
           // Implementation here
         },
         'create',
         'Expedition'
       );
     }
   }
   ```

3. **Error Handling Pattern**
   - Server routes must use the `handleError` helper pattern from `starships.ts`
   - Already handles `ValidationError`, `ConstraintViolationError`, `NotFoundError`
   - Copy the error handling helper to expedition routes

4. **API Client Pattern**
   - Use axios instance from `/lib/api.ts` (already configured with auth)
   - Simple direct API calls, no caching needed
   - Example:
   ```typescript
   export const expeditionAPI = {
     create: async (starshipId: string, data: CreateExpeditionData) => {
       const response = await api.post(`/api/starships/${starshipId}/expeditions`, data);
       return response.data;
     },
     list: async (starshipId: string) => {
       const response = await api.get(`/api/starships/${starshipId}/expeditions`);
       return response.data;
     }
   }
   ```

5. **Page Structure Pattern**
   - Follow async params pattern from existing ship pages
   - Use `AuthGate` wrapper for authentication
   - Example:
   ```typescript
   export default async function ExpeditionsPage({ params }: PageProps) {
     const { slug } = await params; // Note: await params
     return (
       <AuthGate>
         <ExpeditionDashboard starshipSlug={slug} />
       </AuthGate>
     );
   }
   ```

6. **Toast Notifications**
   - Use existing `useToast` hook from `/hooks/useToast`
   - Pattern:
   ```typescript
   import { useToast } from '@/hooks/useToast';
   const { toast } = useToast();
   
   // Success
   toast({
     title: "Expedition created",
     description: "Your expedition has been created successfully"
   });
   
   // Error
   toast({
     title: "Error",
     description: error.message,
     variant: "destructive"
   });
   ```

7. **Agent Assignment Considerations**
   - Agents already have `starshipId` field
   - Expedition will create `ASSIGNED_TO` relationships
   - No conflict - agents can belong to starship AND be assigned to expeditions

### 📋 **Updated Implementation Checklist**

1. **Backend Implementation**
   - [ ] Create `ExpeditionRepository` extending `BaseRepository`
   - [ ] Add error handling using `executeWithErrorHandling` wrapper
   - [ ] Copy `handleError` helper to expedition routes
   - [ ] Register repository in `RepositoryFactory`

2. **Frontend Implementation**
   - [ ] Build `AgentMultiSelect` component using `Checkbox`
   - [ ] Use existing `useToast` for notifications
   - [ ] Follow `AuthGate` pattern for page wrapper
   - [ ] Use axios instance from `/lib/api.ts`

3. **Data Flow**
   - [ ] Agents filtered by `starshipId` for selection
   - [ ] Create `ASSIGNED_TO` relationships in Neo4j
   - [ ] Fresh data fetch on component mount and after actions

### 🚀 **Ready to Implement**
The plan is fully executable with these minor adjustments. No architectural changes or major refactoring required.

## Final Comprehensive Analysis - Additional Implementation Details

### ✅ **Plan is Complete - No Missing Blocks**
The implementation plan covers all necessary components and follows codebase patterns correctly.

### 🔍 **Additional Implementation Details**

1. **UUID Generation**
   - Use `import { v4 as uuidv4 } from 'uuid'` for ID generation
   - Pattern seen in all repositories

2. **Database Indexes**
   - Add to `connection.ts` in the indexes array:
   ```typescript
   'CREATE INDEX expedition_starship_index IF NOT EXISTS FOR (e:Expedition) ON (e.starshipId)',
   'CREATE INDEX expedition_status_index IF NOT EXISTS FOR (e:Expedition) ON (e.status)',
   'CREATE INDEX expedition_name_index IF NOT EXISTS FOR (e:Expedition) ON (e.name)'
   ```

3. **Authorization Pattern**
   - Must check ownership before ALL operations:
   ```typescript
   // In expedition routes - verify expedition belongs to user's starship
   const starship = await starshipRepo.findById(expedition.starshipId);
   if (!starship || starship.ownerId !== req.user!.id) {
     res.status(403).json({ error: 'Access denied' });
     return;
   }
   ```

4. **Delete Operations**
   - Use `DETACH DELETE` for removing nodes with relationships:
   ```typescript
   // In ExpeditionRepository.delete()
   const result = await connection.executeWrite<{ deletedCount: number }>(
     'MATCH (e:Expedition) WHERE e.id = $id DETACH DELETE e RETURN count(e) as deletedCount',
     { id }
   );
   ```

5. **Validation in BaseRepository**
   - Use inherited validation methods:
   ```typescript
   // In ExpeditionRepository.create()
   this.validateRequired(data, ['name', 'starshipId']);
   this.validateStringLengths(data, { 
     name: { min: 3, max: 50 },
     description: { max: 500 }
   });
   this.validateEnums(data, {
     status: ['active', 'inactive', 'completed']
   });
   ```

6. **Complete Type Definitions**
   - Add to `/packages/protocol/src/index.ts`:
   ```typescript
   // Expedition types
   export interface Expedition {
     id: string;
     name: string;
     description?: string;
     starshipId: string;
     status: 'active' | 'inactive' | 'completed';
     createdAt: string;
     updatedAt: string;
   }
   
   export interface CreateExpeditionRequest {
     name: string;
     description?: string;
     agentIds: string[];
   }
   
   export interface ExpeditionResponse {
     expedition: Expedition;
     agents: Agent[];
     starship: Starship;
   }
   
   export interface ExpeditionListResponse {
     expeditions: Expedition[];
     total: number;
   }
   ```

7. **Error Response Format**
   - Consistent error responses:
   ```typescript
   // Copy from starships.ts handleError function
   if (error instanceof ValidationError) {
     res.status(400).json({
       error: 'Validation Error',
       message: error.message,
       field: error.field,
     });
   }
   ```

8. **Repository Type Export**
   - Add to `/packages/models/src/types.ts`:
   ```typescript
   export interface ExpeditionRepository {
     findAll(): Promise<Expedition[]>;
     findById(id: string): Promise<Expedition | null>;
     findByStarship(starshipId: string): Promise<Expedition[]>;
     create(entity: Omit<Expedition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expedition>;
     update(id: string, updates: Partial<Expedition>): Promise<Expedition | null>;
     delete(id: string): Promise<boolean>;
     assignAgents(expeditionId: string, agentIds: string[]): Promise<void>;
     getAssignedAgents(expeditionId: string): Promise<Agent[]>;
   }
   ```

### 📝 **Complete Implementation Checklist**

1. **Database Setup**
   - [ ] Add indexes to `connection.ts`
   - [ ] No migration needed for new feature

2. **Backend Implementation**
   - [ ] Create `ExpeditionRepository` extending `BaseRepository`
   - [ ] Implement all validation using inherited methods
   - [ ] Use `DETACH DELETE` for deletions
   - [ ] Add authorization checks in routes
   - [ ] Copy `handleError` helper function

3. **Type Definitions**
   - [ ] Add all interfaces to `protocol/src/index.ts`
   - [ ] Add repository interface to `models/src/types.ts`
   - [ ] Export from appropriate index files

4. **Frontend Implementation**
   - [ ] Use consistent error response handling
   - [ ] Follow established UI patterns
   - [ ] Simple data fetching with useEffect

### 🚀 **Execution Ready**
The plan is comprehensive with all implementation details. No blockers or missing pieces identified.