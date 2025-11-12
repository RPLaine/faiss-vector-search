# Workflow Canvas Integration Guide

## Overview
The workflow canvas displays 7 phases of journalist work as visual nodes with progress tracking.

## Phases
1. **Invent Subject** (💡) - Generate article topic
2. **Get Sources** (📚) - Retrieve relevant documents
3. **Extract Data** (🔍) - Process and analyze sources
4. **Find Names** (👤) - Identify relevant people/entities
5. **Send Contacts** (📤) - Send emails/phone calls
6. **Receive Info** (📥) - Collect responses
7. **Write Article** (✍️) - Generate final article

## WebSocket Event Format

To update workflow phases from the backend, emit this event:

```python
await manager.broadcast({
    "type": "workflow_phase",
    "timestamp": datetime.now().isoformat(),
    "data": {
        "agent_id": "agent-123",
        "phase": 0,  # 0-6 (phase index)
        "status": "active"  # "active" or "completed"
    }
})
```

## Backend Integration Example

```python
# In your agent execution logic:

async def execute_agent_workflow(agent_id: str):
    # Phase 0: Invent Subject
    await broadcast_phase(agent_id, 0, "active")
    subject = await invent_subject()
    await broadcast_phase(agent_id, 0, "completed")
    
    # Phase 1: Get Sources
    await broadcast_phase(agent_id, 1, "active")
    sources = await retrieve_sources(subject)
    await broadcast_phase(agent_id, 1, "completed")
    
    # Phase 2: Extract Data
    await broadcast_phase(agent_id, 2, "active")
    data = await extract_data(sources)
    await broadcast_phase(agent_id, 2, "completed")
    
    # Phase 3: Find Names
    await broadcast_phase(agent_id, 3, "active")
    names = await find_relevant_names(data)
    await broadcast_phase(agent_id, 3, "completed")
    
    # Phase 4: Send Contacts
    await broadcast_phase(agent_id, 4, "active")
    await send_emails_and_calls(names)
    await broadcast_phase(agent_id, 4, "completed")
    
    # Phase 5: Receive Info
    await broadcast_phase(agent_id, 5, "active")
    responses = await receive_responses()
    await broadcast_phase(agent_id, 5, "completed")
    
    # Phase 6: Write Article
    await broadcast_phase(agent_id, 6, "active")
    article = await write_article(subject, data, responses)
    await broadcast_phase(agent_id, 6, "completed")

async def broadcast_phase(agent_id: str, phase: int, status: str):
    await manager.broadcast({
        "type": "workflow_phase",
        "timestamp": datetime.now().isoformat(),
        "data": {
            "agent_id": agent_id,
            "phase": phase,
            "status": status
        }
    })
```

## Automatic Phase Progression

The canvas automatically:
- Shows previous phases as completed (green)
- Highlights current phase with glow effect (blue)
- Shows future phases as pending (gray)
- Draws animated connections between phases
- Displays all phases as completed when agent finishes

## Manual Testing

You can test phase updates via browser console:

```javascript
// Get UI manager instance
const uiManager = app.uiManager;

// Update to phase 3 (Find Names)
uiManager.updateWorkflowPhase('agent-id', 3, 'active');

// Complete entire workflow
uiManager.completeWorkflow('agent-id');
```
