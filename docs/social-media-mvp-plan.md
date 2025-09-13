# Social Media Manager - MVP Implementation Plan (5-7 Days)

## 🎯 MVP Goal
Build the **simplest possible LinkedIn automation tool** that proves users will trust AI to write and publish their professional content.

## 📊 MVP Status Tracker

### Overall Progress: ░░░░░░░░░░ 0% Complete (Day 0/5)

| Day | Focus | Status | Complete |
|-----|-------|--------|----------|
| **Day 1** | LinkedIn OAuth | 🔴 Not Started | 0% |
| **Day 2** | Data Models & AI Integration | 🔴 Not Started | 0% |
| **Day 3** | Publishing Workflow | 🔴 Not Started | 0% |
| **Day 4** | Basic UI | 🔴 Not Started | 0% |
| **Day 5** | Testing & Deploy | 🔴 Not Started | 0% |

**Current Status**: Not Started  
**Target Launch**: [Date + 5 days]  
**Budget**: $2,500 (vs $7,000 full version)

---

## 🚀 What We're Building (And NOT Building)

### ✅ IN Scope (MVP - 5 Days)
1. **LinkedIn OAuth** - Connect account securely
2. **AI Post Generator** - Create posts from prompts
3. **Direct Publishing** - Post immediately to LinkedIn
4. **Success Confirmation** - Show published posts
5. **Basic Error Handling** - Retry failed posts

### ❌ OUT of Scope (Future)
- ~~Scheduling posts~~ (Week 2)
- ~~Analytics dashboard~~ (Week 2)
- ~~Connection management~~ (Week 2)
- ~~Message automation~~ (Week 3)
- ~~Content calendar~~ (Week 2)
- ~~Multiple accounts~~ (Month 2)
- ~~Other platforms~~ (Month 2+)

---

## 🏗️ Technical Architecture (Simplified)

```
User Flow (MVP):
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│Connect      │────▶│Generate Post │────▶│Publish Now  │
│LinkedIn     │     │with AI       │     │to LinkedIn  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
   OAuth2 Flow         GPT-4 API           LinkedIn API
```

### Minimal Component Stack

```typescript
// Only what's absolutely necessary
const MVP_STACK = {
  backend: {
    auth: ['OAuth2Manager', 'TokenStorage'],
    services: ['LinkedInService', 'AIContentService'],
    api: ['POST /auth/linkedin', 'POST /generate', 'POST /publish']
  },
  frontend: {
    components: ['ConnectButton', 'PostComposer', 'PublishButton'],
    pages: ['/', '/compose', '/success']
  },
  database: {
    tables: ['users', 'linkedin_tokens', 'published_posts']
  }
};
```

---

## 📅 Day-by-Day Implementation

### Day 1: LinkedIn OAuth (Tuesday)
**Goal**: User can connect their LinkedIn account

| Time | Task | Owner | Status |
|------|------|-------|--------|
| 9:00-11:00 | Set up LinkedIn App & OAuth2Manager | - | ⬜ |
| 11:00-1:00 | Implement auth flow & token storage | - | ⬜ |
| 2:00-4:00 | Create user session management | - | ⬜ |
| 4:00-6:00 | Test OAuth flow end-to-end | - | ⬜ |

**Success Criteria**: 
- [ ] User clicks "Connect LinkedIn"
- [ ] Completes OAuth flow
- [ ] Token saved to database
- [ ] "Connected as [Name]" displays

**Code Location**: 
- `packages/server/src/auth/LinkedInOAuth.ts`
- `packages/client/src/components/ConnectLinkedIn.tsx`

---

### Day 2: Data Models & AI Integration (Wednesday)
**Goal**: Database ready, AI can generate posts

| Time | Task | Owner | Status |
|------|------|-------|--------|
| 9:00-10:00 | Create minimal data models | - | ⬜ |
| 10:00-12:00 | Set up OpenAI/GPT-4 integration | - | ⬜ |
| 1:00-3:00 | Build prompt templates for LinkedIn | - | ⬜ |
| 3:00-5:00 | Test content generation | - | ⬜ |

**Success Criteria**:
- [ ] Database migrations run
- [ ] AI generates professional LinkedIn posts
- [ ] Content appropriate for platform

**Code Location**:
- `packages/models/src/entities/Post.ts`
- `packages/server/src/services/AIContentService.ts`

---

### Day 3: Publishing Workflow (Thursday)
**Goal**: Posts can be published to LinkedIn

| Time | Task | Owner | Status |
|------|------|-------|--------|
| 9:00-11:00 | Implement LinkedIn post API | - | ⬜ |
| 11:00-1:00 | Build publish service | - | ⬜ |
| 2:00-4:00 | Add error handling & retries | - | ⬜ |
| 4:00-5:00 | Store published posts | - | ⬜ |

**Success Criteria**:
- [ ] Post publishes to LinkedIn
- [ ] Success/failure feedback
- [ ] Published posts saved to DB
- [ ] LinkedIn URL returned

**Code Location**:
- `packages/server/src/services/LinkedInPublisher.ts`
- `packages/server/src/api/publish.ts`

---

### Day 4: Basic UI (Friday)
**Goal**: Minimal but functional user interface

| Time | Task | Owner | Status |
|------|------|-------|--------|
| 9:00-11:00 | Create post composer component | - | ⬜ |
| 11:00-1:00 | Build publish flow UI | - | ⬜ |
| 2:00-3:00 | Add loading states & error messages | - | ⬜ |
| 3:00-5:00 | Create published posts list | - | ⬜ |

**Success Criteria**:
- [ ] Clean, simple interface
- [ ] Generate → Review → Publish flow
- [ ] Clear success/error states
- [ ] Mobile responsive

**Code Location**:
- `packages/client/src/pages/Compose.tsx`
- `packages/client/src/components/PostComposer.tsx`

---

### Day 5: Testing & Deployment (Monday)
**Goal**: MVP live and working

| Time | Task | Owner | Status |
|------|------|-------|--------|
| 9:00-11:00 | End-to-end testing | - | ⬜ |
| 11:00-12:00 | Fix critical bugs | - | ⬜ |
| 1:00-2:00 | Deploy to staging | - | ⬜ |
| 2:00-3:00 | Final testing on staging | - | ⬜ |
| 3:00-4:00 | Deploy to production | - | ⬜ |
| 4:00-5:00 | Monitor & hotfix | - | ⬜ |

**Success Criteria**:
- [ ] 10 test posts published successfully
- [ ] No critical errors
- [ ] < 5 second response times
- [ ] Live on production

---

## 🧪 MVP Testing Checklist

### Functional Tests
- [ ] Connect LinkedIn account
- [ ] Generate post from "AI trends" prompt
- [ ] Generate post from "product launch" prompt
- [ ] Publish generated post
- [ ] View published posts
- [ ] Handle auth token expiry
- [ ] Handle API errors gracefully

### User Flow Tests
- [ ] Complete flow in < 3 minutes
- [ ] No confusing steps
- [ ] Clear error messages
- [ ] Success confirmation visible

### Edge Cases
- [ ] Network timeout handling
- [ ] LinkedIn API rate limits
- [ ] Invalid/expired tokens
- [ ] Empty post content
- [ ] Very long posts (3000+ chars)

---

## 📈 MVP Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Successful Connections** | 10 users | Database count |
| **Posts Published** | 50 posts | LinkedIn API |
| **AI Satisfaction** | 80% use AI content as-is | Track edits |
| **Time to Publish** | < 2 minutes | Analytics |
| **Error Rate** | < 5% | Error logs |
| **User Return Rate** | 50% return Day 2 | Analytics |

---

## 🚦 Go/No-Go Decision Criteria

After 1 week of MVP usage, evaluate:

### 🟢 GO (Build Full Version) if:
- ✅ 10+ active users
- ✅ 100+ posts published  
- ✅ 70%+ posts use AI generation
- ✅ Users request scheduling feature
- ✅ < 5% error rate

### 🔴 NO-GO (Pivot/Iterate) if:
- ❌ < 5 active users
- ❌ < 20 posts published
- ❌ Users heavily edit AI content
- ❌ > 20% error rate
- ❌ Users don't return after Day 1

---

## 💻 Quick Start Code

### 1. LinkedIn OAuth Setup
```typescript
// packages/server/src/auth/LinkedInOAuth.ts
export class LinkedInOAuth {
  private config = {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'r_liteprofile r_emailaddress w_member_social'
  };

  getAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  async exchangeCodeForToken(code: string): Promise<TokenSet> {
    // Implementation here
  }
}
```

### 2. AI Content Generation
```typescript
// packages/server/src/services/AIContentService.ts
export class AIContentService {
  async generateLinkedInPost(prompt: string): Promise<string> {
    const systemPrompt = `You are a LinkedIn content expert. 
    Create professional, engaging posts that:
    - Are 100-300 words
    - Include relevant hashtags
    - Have a clear call-to-action
    - Sound authentic, not salesy`;

    const response = await openai.createCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Write a LinkedIn post about: ${prompt}` }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  }
}
```

### 3. LinkedIn Publisher
```typescript
// packages/server/src/services/LinkedInPublisher.ts
export class LinkedInPublisher {
  async publish(content: string, accessToken: string): Promise<PublishResult> {
    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      })
    });

    return response.json();
  }
}
```

### 4. Simple React UI
```tsx
// packages/client/src/pages/Compose.tsx
export function Compose() {
  const [prompt, setPrompt] = useState('');
  const [generated, setGenerated] = useState('');
  const [publishing, setPublishing] = useState(false);

  const handleGenerate = async () => {
    const post = await api.generatePost(prompt);
    setGenerated(post);
  };

  const handlePublish = async () => {
    setPublishing(true);
    const result = await api.publishPost(generated);
    if (result.success) {
      navigate('/success');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1>Create LinkedIn Post</h1>
      
      <input
        placeholder="What do you want to post about?"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full p-3 border rounded"
      />
      
      <button onClick={handleGenerate} className="btn-primary">
        Generate with AI
      </button>

      {generated && (
        <>
          <textarea
            value={generated}
            onChange={(e) => setGenerated(e.target.value)}
            className="w-full h-40 p-3 border rounded"
          />
          
          <button 
            onClick={handlePublish} 
            disabled={publishing}
            className="btn-success"
          >
            {publishing ? 'Publishing...' : 'Publish to LinkedIn'}
          </button>
        </>
      )}
    </div>
  );
}
```

---

## 🔧 Environment Setup

### Required Environment Variables
```bash
# .env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/callback
OPENAI_API_KEY=your_openai_key
DATABASE_URL=postgresql://localhost/social_mvp
REDIS_URL=redis://localhost:6379
```

### Quick Database Schema
```sql
-- Minimal tables for MVP
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  linkedin_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE linkedin_tokens (
  user_id UUID REFERENCES users(id),
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP
);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  content TEXT,
  linkedin_url TEXT,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Launch Checklist

### Pre-Launch (Day 4)
- [ ] LinkedIn App approved
- [ ] OAuth redirect URLs configured
- [ ] OpenAI API key with credits
- [ ] Database provisioned
- [ ] Staging environment ready

### Launch Day (Day 5)
- [ ] Deploy to production
- [ ] Test with team accounts
- [ ] Monitor error logs
- [ ] Share with 10 beta users
- [ ] Set up analytics tracking

### Post-Launch (Day 6-7)
- [ ] Daily usage report
- [ ] Bug fixes based on feedback
- [ ] Collect feature requests
- [ ] Decide on full version build

---

## 📞 Support During MVP

### Daily Standup (15 min)
- **Time**: 9:00 AM
- **Format**: What's done, what's next, blockers

### Escalation Path
1. **Critical Bugs**: Fix immediately
2. **Feature Requests**: Log for v2
3. **OAuth Issues**: Priority 1
4. **AI Quality**: Monitor, adjust prompts

### Success Celebration 🎉
If we hit 50 posts published in Week 1, team celebration!

---

## 📝 Notes & Decisions

### Why These Choices?
- **No Scheduling**: Adds complexity, not core to validation
- **Text Only**: Images/video can wait
- **No Analytics**: Too early, need data first
- **Single Account**: Simplifies auth flow
- **Direct Publish**: Simpler than draft/review flow

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| LinkedIn API changes | Use official API, follow docs |
| Poor AI content | Test prompts thoroughly |
| Token expiry | Implement refresh flow Day 1 |
| User confusion | Clear, simple UI |

---

*MVP Plan Version: 1.0*  
*Created: 2025-01-13*  
*Goal: Launch in 5 days, validate in 7 days*  
*Budget: $2,500*  
*Owner: Starships.ai Team*