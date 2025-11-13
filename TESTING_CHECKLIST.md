# Testing Checklist - Phase 2 Refactoring

## Pre-Test Setup

- [ ] Ensure `server2.py` is running
- [ ] Open browser console (F12) to monitor logs
- [ ] Navigate to http://localhost:8001
- [ ] Verify "Connected" status in top-left

## Core Functionality Tests

### Agent Creation
- [ ] Click "Create New Agent" button
- [ ] Leave name empty, add context, submit
- [ ] Verify agent appears with default name "Journalist"
- [ ] Check console for `[API] POST /agents/create` log
- [ ] Verify no errors in console

### Agent Start
- [ ] Click "Start" button on agent
- [ ] Verify button changes to "Stop"
- [ ] Check console for `[Agent X] Starting` log
- [ ] Verify content area clears
- [ ] Watch for phase 0 completion

### Task Creation (Phase 0)
- [ ] Wait for phase 0 to complete
- [ ] Verify tasks appear to the right of agent
- [ ] Count tasks (should match tasklist)
- [ ] Check console for `[TaskController] Creating X tasks` log
- [ ] Verify task positioning (aligned with agent)

### Task Execution
- [ ] Watch first task status change to "running"
- [ ] Verify task aligns with agent top border
- [ ] Check task content updates with streaming
- [ ] Wait for task completion
- [ ] Verify validation appears (✓ Valid or ✗ Invalid)
- [ ] Verify task status changes to "completed"
- [ ] Watch next task start automatically

### Agent Controls
- [ ] Toggle "Auto" checkbox on/off
- [ ] Check console for `[Agent X] Auto: true/false`
- [ ] Toggle "Halt" checkbox
- [ ] Verify agent halts at next phase boundary
- [ ] Click "Continue" button (if halted)
- [ ] Verify agent resumes execution

### Agent Edit
- [ ] Click "Edit" button on non-running agent
- [ ] Change name, context, temperature
- [ ] Submit changes
- [ ] Verify agent updates without recreating DOM
- [ ] Check console for `[API] PUT /agents/X` log

### Agent Stop
- [ ] Click "Stop" button on running agent
- [ ] Verify agent status changes to "created"
- [ ] Check console for `[Agent X] Stopped` log
- [ ] Verify button changes back to "Start"

### Agent Delete
- [ ] Click "Delete" button
- [ ] Confirm deletion prompt
- [ ] Verify agent fades out and removes
- [ ] Verify tasks also removed
- [ ] Check stats update correctly

## Advanced Tests

### Multiple Agents
- [ ] Create 3 agents simultaneously
- [ ] Start all 3 agents
- [ ] Verify all execute independently
- [ ] Check canvas scrolling accommodates all content
- [ ] Verify connection lines draw correctly

### WebSocket Reconnection
- [ ] Stop server (`Ctrl+C`)
- [ ] Verify "Disconnected" status
- [ ] Restart server
- [ ] Verify "Connected" status returns
- [ ] Verify existing agents still visible

### UI Responsiveness
- [ ] Resize browser window
- [ ] Verify layout adjusts
- [ ] Verify connection lines redraw
- [ ] Check mobile viewport (if applicable)

### Content Expansion
- [ ] Toggle "Expand" checkbox
- [ ] Verify content area expands
- [ ] Verify smooth animation
- [ ] Toggle back to collapsed
- [ ] Verify agent re-centers in viewport

## Architecture Validation

### API Centralization
- [ ] Search console for "fetch(" calls
- [ ] Verify all HTTP requests show `[API]` prefix
- [ ] Verify no direct fetch() in UI components

### Separation of Concerns
- [ ] Open browser DevTools → Sources
- [ ] Find `ui-manager-refactored.js`
- [ ] Verify no `fetch()` calls in file
- [ ] Find `agent-controller.js`
- [ ] Verify no DOM manipulation (no `.querySelector()`, `.innerHTML`)

### Error Handling
- [ ] Create agent with invalid temperature (e.g., "abc")
- [ ] Verify error alert appears
- [ ] Check console for error log
- [ ] Verify app remains stable

### Memory Leaks
- [ ] Create 5 agents
- [ ] Delete all 5 agents
- [ ] Open Chrome DevTools → Memory
- [ ] Take heap snapshot
- [ ] Verify no orphaned DOM nodes
- [ ] Verify observers properly cleaned up

## Performance Tests

### Load Time
- [ ] Hard refresh page (Ctrl+Shift+R)
- [ ] Note time to "Connected" status
- [ ] Should be < 2 seconds

### Animation Smoothness
- [ ] Watch task creation animation
- [ ] Verify smooth stagger effect
- [ ] Watch task alignment animation
- [ ] Verify smooth 800ms transition
- [ ] Check for frame drops (DevTools → Performance)

### Streaming Performance
- [ ] Start agent with long output
- [ ] Watch streaming chunks
- [ ] Verify no UI lag
- [ ] Verify content scrolls smoothly

## Browser Compatibility

### Chrome/Edge
- [ ] All tests pass
- [ ] Console shows no errors

### Firefox
- [ ] All tests pass
- [ ] Console shows no errors

### Safari (if available)
- [ ] All tests pass
- [ ] Console shows no errors

## Known Issues / Differences

### Expected Changes
- Console logs now show more structure (`[API]`, `[Agent X]`, `[TaskController]`)
- Call stack is cleaner (fewer intermediate functions)

### Not Expected (Report if Found)
- Different visual appearance
- Different timing/animations
- Missing functionality
- New errors in console

## Bug Report Template

If you find an issue:

```
## Bug Description
[Clear description of the problem]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [And so on...]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Console Output
[Copy/paste console errors]

## Browser
[Browser name and version]

## Screenshots
[If applicable]
```

## Success Criteria

✅ **Phase 2 Complete When:**
- All core functionality tests pass
- No console errors
- API calls centralized through APIService
- Clean separation of concerns verified
- Performance is equal or better than original
- No memory leaks detected

## Rollback Trigger

🚨 **Rollback to Original if:**
- Critical functionality broken
- Performance significantly degraded
- Memory leaks detected
- Multiple browser incompatibilities

To rollback: Change `index.html` back to:
```html
<script type="module" src="/js/app.js"></script>
```
