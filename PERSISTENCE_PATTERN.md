# State Persistence Pattern - System 2

## Persistence Strategy

All agent state changes are immediately persisted to `agent_state.json` to ensure:
1. State survives server restarts
2. Browser refreshes show accurate state
3. No data loss during failures

## Persistence Points

### AgentManager Methods (Auto-persist)
These methods call `_save_state()` internally:
- `create_agent()` - After creating new agent
- `update_agent_status()` - After status changes
- `update_agent()` - After field updates
- `delete_agent()` - After deletion
- `clear_completed_agents()` - After bulk deletion
- `set_selected_agent_id()` - After selection change

### Server Endpoints (Explicit persistence)
These endpoints call `_save_state()` explicitly for state changes NOT covered by AgentManager methods:

#### `/api/agents/{agent_id}/start` (Line 245)
- Persists `halt`, `current_phase`, cleared responses

#### `/api/agents/{agent_id}/continue` (Line 283)
- Persists `halt = False` flag change
- Then calls `update_agent_status()` for status change

#### `/api/agents/{agent_id}/halt` (Line 316)
- Persists `halt` flag toggle

#### `/api/agents/{agent_id}/auto` (Line 338)
- Persists `auto` flag toggle

#### `/api/agents/{agent_id}/expand` (Line 360)
- Persists `expanded` flag toggle

#### `/api/agents/{agent_id}/redo` (Line 457)
- Persists `redo_phase`, cleared phase responses
- Then calls `update_agent_status()` for status change

#### `/api/agents/{agent_id}/stop` (Line 408)
- Persists `cancelled = True` flag
- Then calls `update_agent_status()` for status change to 'stopped'

#### `/api/agents/{agent_id}/redo-task` (Line 520)
- Persists task reset (`status`, `output`, `validation` cleared)
- Persists `redo_task_id` marker
- Then calls `update_agent_status()` for status change

#### `/api/agents/{agent_id}` (PUT) (Line 753)
- Persists name, context, temperature, auto updates

### Auto-Restart Logic (run_agent function)

#### Auto-restart state reset (Line 653)
- Persists `halt`, `current_phase`, `continue` reset before restart
- Then calls `update_agent_status()` for status change to 'running'

### Workflow Callbacks (Auto-persist via AgentManager)

#### `phase_callback` in `run_agent()` (Line 565)
- Calls `_save_state()` after phase completion

#### `task_callback` in workflow_executor (workflow_executor.py:174)
- Calls `_save_state()` when task status changes to running/completed/failed/cancelled

#### Task completion in workflow_executor (workflow_executor.py:274)
- Calls `_save_state()` after storing task results

## Verification Checklist

✅ All direct agent dict modifications followed by `_save_state()`
✅ All `update_agent_status()` calls include internal `_save_state()`
✅ Task status changes persist via workflow callbacks
✅ Phase completions persist via phase callback
✅ UI state (halt, auto, expanded, selected) persists immediately
✅ Redo operations persist before restarting workflow

## Pattern Rule

**Every endpoint that modifies agent state MUST either:**
1. Use `agent_manager.update_agent_status()` or `agent_manager.update_agent()` (auto-persists), OR
2. Call `agent_manager._save_state()` explicitly after modifications

**Never modify `agent` dict without persisting!**
