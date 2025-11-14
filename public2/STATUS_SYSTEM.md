# Agent and Task Status System

## Overview

This document defines the complete status system for agents and tasks in the AI Journalist demo system.

## Agent Statuses

### Status Values

| Status | Display Text | Description | Can Start | Can Stop | Can Continue | Can Edit |
|--------|-------------|-------------|-----------|----------|--------------|----------|
| `created` | Created | Agent created but not started | ✅ | ❌ | ❌ | ✅ |
| `running` | Running | Agent executing workflow | ❌ | ✅ | ❌ | ❌ |
| `halted` | Phase Complete | Agent paused between phases | ❌ | ❌ | ✅ | ✅ |
| `completed` | Completed | Agent finished successfully | ✅ | ❌ | ❌ | ✅ |
| `failed` | Failed | Agent encountered an error | ✅ | ❌ | ❌ | ✅ |
| `tasklist_error` | Tasklist Error | Tasklist validation failed | ✅ | ❌ | ❌ | ✅ |

### Status Flow

```
┌─────────┐
│ created │◄──────────────────┐
└────┬────┘                   │
     │                        │
     │ /start                 │ /stop
     │                        │
     ▼                        │
┌─────────┐     halt=true  ┌──┴────┐
│ running ├──────────────►│ halted│
└────┬────┘                └───┬───┘
     │                         │
     │                         │ /continue
     │                         │
     │                         ▼
     │                     ┌─────────┐
     │                     │ running │
     │                     └────┬────┘
     │                          │
     ├──────────────────────────┘
     │
     ├──► completed
     │
     ├──► failed
     │
     └──► tasklist_error
```

### Control Panel Button Matrix

Based on agent status, the control panel shows:

| Agent Status | Action Button | Continue Button | Halt Checkbox |
|--------------|--------------|-----------------|---------------|
| `created` | ▶️ Start | Hidden | Visible |
| `running` | ⏹️ Stop | Hidden | Visible |
| `halted` (with failed tasks) | 🔄 Redo | Visible | Hidden |
| `halted` (no failed tasks) | Hidden | Visible | Hidden |
| `completed` | 🔄 Restart | Hidden | Visible |
| `failed` | 🔄 Restart | Hidden | Visible |
| `tasklist_error` | 🔄 Restart | Hidden | Visible |

### Backend State Transitions

All status changes originate from the backend:

1. **Start Agent** (`POST /api/agents/{id}/start`)
   - `created` → `running`
   - `completed` → `running` (restart)
   - `failed` → `running` (restart)

2. **Stop Agent** (`POST /api/agents/{id}/stop`)
   - `running` → `created` (sets `cancelled=True`)

3. **Continue Agent** (`POST /api/agents/{id}/continue`)
   - `halted` → `running` (clears `halt` flag)

4. **Workflow Execution** (automatic transitions)
   - `running` → `halted` (when `halt=True` at checkpoint)
   - `running` → `completed` (all tasks done)
   - `running` → `failed` (error occurred)
   - `running` → `tasklist_error` (Phase 0 validation failed)

## Task Statuses

### Status Values

| Status | Display Text | Description | Can Rerun |
|--------|-------------|-------------|-----------|
| `created` | Created | Task defined but not started | ❌ |
| `running` | Running | Task currently executing | ❌ |
| `completed` | Completed | Task finished successfully | ❌ |
| `failed` | Failed | Task failed validation or execution | ✅ |
| `cancelled` | Cancelled | Task cancelled before completion | ❌ |

### Status Flow

```
┌─────────┐
│ created │
└────┬────┘
     │
     │ Task execution starts
     │
     ▼
┌─────────┐
│ running │
└────┬────┘
     │
     ├──► completed (validation passed)
     │
     ├──► failed (validation failed or error)
     │
     └──► cancelled (agent stopped)
```

### Validation Impact

Tasks have a special validation step after execution:

```
Task executes
    ↓
Output generated
    ↓
LLM validates output
    ↓
    ├── is_valid=true  → status: completed
    └── is_valid=false → status: failed
```

## Frontend Status Handlers

### AgentStatusHandler

Location: `public2/js/handlers/agent-status-handler.js`

**Responsibilities:**
- Validate status transitions
- Update AgentManager state
- Update AgentRenderer UI
- Update ControlPanelManager buttons
- Provide status predicates (canStart, canStop, etc.)

**Usage:**
```javascript
// Update status
agentStatusHandler.updateStatus(agentId, 'running', { hasFailedTasks: false });

// Check permissions
if (agentStatusHandler.canStart(agentId)) {
    // Start agent
}
```

### TaskStatusHandler

Location: `public2/js/handlers/task-status-handler.js`

**Responsibilities:**
- Validate status transitions
- Update TaskRenderer UI
- Trigger layout alignment when task becomes active
- Provide status predicates (canRerun, isTerminal, etc.)

**Usage:**
```javascript
// Update status
taskStatusHandler.updateStatus(agentId, taskId, 'running');

// Check if task can be rerun
if (taskStatusHandler.canRerun(agentId, taskId)) {
    // Show redo button
}
```

## Integration with Existing Code

### WebSocket Event Handler

```javascript
// Before (direct updates):
this.agentManager.updateAgentStatus(agentId, 'running');
this.uiManager.updateAgentStatus(agentId, 'running');

// After (through status handler):
this.agentStatusHandler.updateStatus(agentId, 'running');
```

### Control Panel Manager

The control panel uses `_updateForStatus()` to determine which buttons to show based on the current agent status and metadata (like `hasFailedTasks`).

## Status Constants

Location: `public2/js/constants/status-constants.js`

All status values, display text, CSS classes, and predicates are centralized in this module:

```javascript
import { 
    AGENT_STATUS, 
    TASK_STATUS, 
    AgentStatusPredicates,
    TaskStatusPredicates 
} from './constants.js';

// Check if agent can be started
if (AgentStatusPredicates.canStart(agent.status)) {
    // ...
}
```

## Backend Alignment

The frontend status constants **must match** the backend implementation:

- **Backend**: `components2/agent_manager.py`, `components2/workflow_executor.py`
- **Frontend**: `public2/js/constants/status-constants.js`

Any new status values must be added to both locations.

## Testing Status Transitions

### Agent Status Tests

1. Create agent → status: `created`
2. Start agent → status: `running`
3. Enable halt → agent pauses → status: `halted`
4. Continue agent → status: `running`
5. Complete workflow → status: `completed`

### Task Status Tests

1. Agent starts → tasks created → status: `created`
2. Task execution begins → status: `running`
3. Task completes → validation → status: `completed` or `failed`
4. Failed task → show redo button

## Error Handling

Invalid status transitions are logged but allowed (backend is authoritative):

```javascript
console.warn(`[AgentStatusHandler] Invalid transition: running → created`);
// Still proceeds with the update
```

This prevents frontend validation from blocking valid backend state changes due to race conditions or edge cases.
