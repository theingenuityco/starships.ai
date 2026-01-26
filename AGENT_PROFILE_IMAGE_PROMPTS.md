# Agent Profile Image Generation Prompts (Generic Template)

Template for generating **three** square (1:1) comic-style images per agent: **Problem Statements**, **Capabilities**, and **Try These Prompts**. Use the same strategy for all agents (Gaia, Aria, Daedalus, etc.) by substituting the placeholders below.

## Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{name}}` | Agent name | Gaia, Aria, Daedalus |
| `{{role}}` | Agent role (≤32 chars) | Agent Creator, Research Assistant |
| `{{core_capabilities}}` | Short description of what the agent does (from role, description, or tools) | Creating agents, managing agents, assigning tools; or: Research, summarization, citations |
| `{{category}}` | Template category | automation, data, coding, support, etc. |
| `{{background_color}}` | Color matching category (see mapping below) | green, purple, indigo |
| `{{domain_context}}` | Their domain/expertise in a few words | agent creation and management; or: research and citations |

### Category → Background Color

| Category | Background Color |
|----------|------------------|
| automation | green |
| data | purple |
| communication | orange |
| coding | indigo |
| creative | pink |
| analysis | cyan |
| support | amber |
| utility | teal |
| general | gray |

---

## Prompt 0: Problem Statements Image (Single Square Image)

**Usage:** Substitute placeholders, then send to image model. Output: 1× square image for "The Problem" section.

```
I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them understanding and empathizing with user challenges.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Interaction Style: Empathetic, understanding, reassuring
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot, slightly closer than capabilities image (more intimate, understanding perspective)
- Eye Contact: {{name}} should be looking directly at the camera/viewer with empathetic, understanding expression
- Pose: Understanding, empathetic, listening - {{name}} leaning slightly forward or with a thoughtful, understanding gesture (e.g., hand near chin, or open palms showing understanding), showing they're actively listening and understanding user challenges
- Expression: Empathetic, understanding, reassuring (warm but not overly casual), looking at camera with genuine concern and understanding
- Setting: Clean, modern tech workspace with subtle elements relevant to {{domain_context}}, but less cluttered than capabilities image - focus on {{name}} and their understanding expression
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "I've seen this before" (exact text - same for all agents)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Warm, empathetic color palette
- Emphasis on understanding and empathy
- Professional but warm and reassuring
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer
- Expression should convey genuine understanding and empathy

Negative Constraints:
- Avoid overly technical or action-oriented poses
- Keep it empathetic and understanding, not dismissive or casual
- Maintain character consistency with {{name}} avatar
- Background should be simple (solid color or subtle gradient)
- Don't make it too casual - maintain professional, empathetic tone
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Show {{name}} understanding user pain points in their domain
- {{name}} must maintain eye contact with the camera/viewer
- Speech bubble must say exactly "I've seen this before" - keep this consistent for all agents
- Avoid making {{name}} look sad or overly concerned - should be understanding and reassuring
```

---

## Prompt 1: Capabilities Image (Single Square Image)

**Usage:** Substitute placeholders, then send to image model. Output: 1× square image for "Capabilities" section.

```
I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them actively using their capabilities.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Core Capabilities: {{core_capabilities}}
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot
- Eye Contact: {{name}} should be looking directly at the camera/viewer
- Pose: Active, working, focused - {{name}} engaged with their domain (e.g. typing, reviewing screens, or managing tools) but with head turned toward camera
- Action: Demonstrating active use of their capabilities (tools, interfaces, or workflows relevant to {{domain_context}}) while maintaining eye contact with viewer
- Setting: Modern tech workspace with screens or tools relevant to {{domain_context}}
- Expression: Confident, professional, focused, welcoming (friendly but not overly casual), looking at camera
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "Here's what I can do." (exact text, with period)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Action-oriented composition showing {{name}} actively working
- Clear visual storytelling of their expertise
- Professional but engaging and welcoming
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer
- Expression should be welcoming, friendly, and approachable while maintaining professionalism

Negative Constraints:
- Avoid cluttered backgrounds - keep it simple with solid color or subtle gradient
- Show active engagement with tools/screens relevant to their role
- Keep it professional, not overly cartoonish
- Speech bubble must say exactly "Here's what I can do." (with period) - keep this consistent for all agents
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Maintain character consistency with {{name}} avatar
- {{name}} must maintain eye contact with the camera/viewer - do not have them looking away or down at screens
- Expression should be welcoming and friendly, not serious or stern
```

---

## Prompt 2: Try These Prompts Image (Single Square Image)

**Usage:** Substitute placeholders, then send to image model. Output: 1× square image for "Try these prompts" section.

```
I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them ready to help users.

Identity Anchors:
- Name: {{name}}
- Role: {{role}}
- Interaction Style: Conversational, helpful, approachable
- Style: Comic strip
- Aspect Ratio: Square (1:1)

Shot Specifics:
- Camera: Medium shot, slightly angled toward viewer (inviting perspective), adjusted for square format
- Eye Contact: {{name}} should be looking directly at the camera/viewer
- Pose: Welcoming, conversational, open - {{name}} sitting at a desk or standing, turned toward viewer with a friendly gesture, ready to help
- Expression: Friendly, ready to help, approachable (can smile), looking at camera
- Setting: Clean, modern tech workspace with subtle elements relevant to {{domain_context}} (e.g. screens or tools in background)
- Background: Solid {{background_color}} color (matching {{category}} category) or subtle gradient
- Speech Bubble: "Just tell me what to do" (exact text - same for all agents)

Quality/Style:
- High-resolution comic strip style
- Square format (1:1 aspect ratio) suitable for web app display
- Warm, inviting color palette
- Emphasis on approachability and friendliness
- Professional but welcoming
- Consistent character appearance with {{name}} avatar
- {{name}} must be looking directly at the camera/viewer

Negative Constraints:
- Avoid intimidating or overly technical poses
- Keep it conversational and friendly
- Maintain character consistency with {{name}} avatar
- Background should be simple (solid color or subtle gradient)
- Don't make it too casual - maintain professional tone
- Single cohesive image, not multiple panels
- Ensure composition works well in square format
- Show {{name}} ready to engage in conversation about their domain
- {{name}} must maintain eye contact with the camera/viewer
- Speech bubble must say exactly "Just tell me what to do" - keep this consistent for all agents
```

---

## Example: Gaia

- `{{name}}`: Gaia  
- `{{role}}`: Agent Creator  
- `{{core_capabilities}}`: Creating agents, managing agents, assigning tools, selecting models  
- `{{category}}`: automation  
- `{{background_color}}`: green  
- `{{domain_context}}`: agent creation and management  

Apply these values to all three prompts above to reproduce the original Gaia-specific prompts.
