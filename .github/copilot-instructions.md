# GitHub Copilot Instructions

## NO DOCUMENTATION UNLESS ASKED

**Do not create .md files, README, CHANGELOG, summaries, or documentation automatically.**

Only create documentation when explicitly requested.

## Dual System Architecture

This codebase contains **two independent systems** sharing common patterns but serving different purposes:

### System 1: RAG Query System (`components/`, `server.py`, `public/`)
**FAISS-based RAG with External LLM Integration**

Three execution modes (mode-based architecture):
- `none`: Direct LLM without retrieval
- `faiss`: Dynamic threshold retrieval + single LLM call  
- `full`: Complete pipeline (retrieval + temperature optimization + iterative improvement)

**Component Structure:**
```
components/
  ├── api/           # FastAPI REST layer (rag_controller.py, api_models.py)
  ├── core/          # Vector operations (EmbeddingService, IndexService, SearchService)
  ├── services/      # External integrations (LLMService, PromptService, ConfigurationProvider)
  ├── retrieval/     # Dynamic threshold adjustment (DynamicRetriever)
  ├── optimization/  # Temperature testing & evaluation (TemperatureOptimizer, ResponseEvaluator)
  ├── improvement/   # Iterative refinement (ResponseImprover)
  ├── execution/     # Mode orchestration (QueryExecutor, ModeSelector)
  ├── modes/         # Query modes (NoneMode, FaissMode, FullMode - all inherit BaseMode)
  └── rag_system.py  # Main orchestrator
```

**Data Flow:** 
1. **Index Building** (offline): `preprocessing/process_docx_files.py` → `preprocessing/chunk_text_files.py` → `files/`
2. **Querying** (runtime): CLI (`main.py`) or Web (`server.py`) → QueryRunner → RAGSystem → QueryExecutor

### System 2: AI Journalist Agents Demo (`components2/`, `server2.py`, `public2/`)
**Multi-agent workflow system for article writing demonstrations**

**Backend Architecture (`components2/`):**
```
components2/
  ├── llm_service.py         # Unified LLM API client with streaming + cancellation support
  ├── agent_manager.py       # Agent lifecycle, state tracking (persists to agent_state.json)
  ├── workflow_executor.py   # Multi-phase article workflow orchestration
  └── task_executor.py       # Individual task execution with LLM validation
```

**Frontend Architecture (`public2/js/`):**
```
public2/js/
  ├── app.js                    # Entry point, dependency injection
  ├── constants/                # Status enums, timing values
  ├── state/                    # Pure state management (AgentManager, TaskManager)
  ├── services/                 # External integrations (APIService, WebSocketService, etc.)
  ├── handlers/                 # Event routing (WebSocketEventHandler, ControlPanelHandler, Status handlers)
  ├── controllers/              # Business logic (AgentController, TaskController)
  ├── renderers/                # Pure DOM rendering (AgentRenderer, TaskRenderer)
  ├── ui/                       # UI coordination (UIManager, CanvasManager, TransitionManager, etc.)
  └── utils/                    # Pure utility functions (animation, DOM, layout calculations)
```

- **Clean separation**: Services → Handlers → Controllers → Renderers → State Managers → UI Coordination
- **No frameworks**: Vanilla ES6 modules, pure DOM manipulation
- **Canvas-based layout**: Infinite scrollable canvas with camera system (not CSS grid)
- **Three-layer visual system**:
  1. Canvas background (layer 0)
  2. SVG connection lines between agents/tasks (layer 1) 
  3. Agent/task DOM nodes positioned absolutely (layer 2)

**Key Frontend Pattern - TransitionManager:**
```javascript
// Critical: Disable transitions during drag/scroll for immediate updates
transitionManager.disableAllTransitions();  // Adds .no-transition to agents/tasks/SVGs
// ... update positions ...
transitionManager.enableAllTransitions();   // Removes .no-transition for smooth animations
```

**Data Flow:**
1. **Phase 0 (Planning)**: Agent created → LLM generates tasklist (JSON) → Tasks rendered as nodes
2. **Task Execution**: Sequential execution → Real-time streaming to UI → LLM validates outputs
3. **WebSocket Events**: Backend callbacks (`phase_callback`, `chunk_callback`, `action_callback`) → `broadcast_event()` → Frontend handlers

## Critical Developer Workflows

### Running Systems

```powershell
# RAG System (port 8000)
python server.py
# Access: http://localhost:8000

# AI Journalist Demo (port 8001)  
python server2.py
# Access: http://localhost:8001

# CLI mode for RAG system
python main.py --data-dir data

# Index building workflow (RAG system)
python preprocessing/process_docx_files.py  # DOCX → Markdown TXT
python preprocessing/chunk_text_files.py    # Chunk → files/
# Then add to FAISS index via web UI
```

### Configuration

All runtime behavior controlled by `config.json` (NOT `config_example.json`):
- `external_llm.url`: LLM endpoint (used by both systems)
- `external_llm.payload_type`: "message" or "completion"
- `retrieval.hit_target`: Dynamic threshold stops when this many docs found
- `optimization.enabled`: Enable/disable temperature testing (RAG system only)
- `improvement.enabled`: Enable/disable iterative refinement (RAG system only)

**Config is reloaded on each query** - no server restart needed for tuning.

## Technology Stack

- **Backend**: Python 3.9+, FastAPI, FAISS (faiss-cpu), sentence-transformers (TurkuNLP/sbert-cased-finnish-paraphrase)
- **Frontend**: Vanilla JavaScript ES6 modules (no frameworks, no jQuery/React/Vue)
- **Communication**: REST API + WebSocket for real-time progress updates
- **State Persistence**: `agent_state.json` for journalist agents, `sessions/` for RAG queries

## Code Conventions

**Python:**
- Type hints mandatory (e.g., `def search(query: str, k: int) -> List[str]`)
- Service classes use dependency injection (see `app.js` constructor for frontend equivalent)
- Exceptions: Custom hierarchy in `components/exceptions.py` (RAGException → ConfigurationError, etc.)
- Async/sync split: FastAPI endpoints are `async def`, business logic is synchronous (runs in ThreadPoolExecutor)
- Logging: Use `logger = logging.getLogger(__name__)` pattern
- **Cancellation pattern** (System 2):
  ```python
  # In workflow_executor.py
  def check_cancelled():
      return agent.get("cancelled", False)
  self.llm_service.cancellation_checker = check_cancelled
  # LLM service checks this during streaming to abort early
  ```

**JavaScript (System 2 Specific):**
- **Strict layer separation**: Services don't manipulate DOM, Renderers don't call APIs
- **Dependency injection**: All dependencies passed via constructor (see `app.js` for wiring)
- **Constants management**: All timing values in `constants.js` (ANIMATION_DURATIONS, POSITIONING_DELAYS, SCROLL_DELAYS)
- **Element registration pattern**:
  ```javascript
  // TransitionManager tracks elements for bulk transition control
  transitionManager.registerAgent(agentId, element);
  // Later: disableAllTransitions() affects all registered elements
  ```
- **Camera system** (CanvasManager):
  ```javascript
  // Two coordinate systems: global (infinite canvas) vs screen (viewport)
  globalToScreen(globalX, globalY)  // For rendering
  screenToGlobal(screenX, screenY)  // For mouse events
  ```

**Callback Patterns:**

System 1 (RAG):
- CLI: Pass `ui_callback` object with methods like `display_threshold_attempt(threshold, hits, target)`
- Web: Pass `json_callback` function that emits JSON to WebSocket

System 2 (Journalist):
- `phase_callback`: Async function for phase status updates → broadcasts `workflow_phase` event
- `chunk_callback`: Sync function for streaming text → broadcasts `phase_chunk`/`agent_chunk` events  
- `action_callback`: Async function for task events → broadcasts `task_running`/`task_completed`/`task_validation` events
- All callbacks are optional but essential for UI updates

## Integration Points

### Adding New Query Modes (System 1)

1. Create `components/modes/my_mode.py` inheriting `BaseMode`
2. Implement: `execute()`, `get_mode_name()`, `get_mode_description()`, `validate_config()`
3. Register in `components/execution/mode_selector.py`

### WebSocket Event Flow (System 2)

All real-time updates flow: Backend callback → `broadcast_event()` → WebSocket → Frontend handler

**Backend** (`server2.py`):
```python
await broadcast_event({
    "type": "task_completed",
    "timestamp": datetime.now().isoformat(),
    "data": {"agent_id": agent_id, "task_id": task_id, "output": output}
})
```

**Frontend** (`websocket-event-handler.js`):
```javascript
wsService.on('task_completed', (data) => this.handleTaskCompleted(data));
// Handler delegates to TaskController → TaskRenderer for DOM updates
```

### Adding New Agent Workflow Phases (System 2)

1. Update `workflow_executor.py`: Add `async def _phase_X(...)` method
2. Call from `execute_workflow()` in sequence, checking halt status between phases
3. Update prompts in `prompts2/` directory (loaded via `_load_prompt()`)
4. Frontend automatically handles new phases via generic `workflow_phase` events

### External LLM API

**System 1**: `components/services/llm_service.py` (RAG-specific features like retry logic)
**System 2**: `components2/llm_service.py` (Unified client with streaming + cancellation)

Both support:
- Streaming (chunks via `progress_callback` or `chunk_callback`)
- Custom headers, timeouts, payload formats
- Error handling and retries
- Configurable via `config.json` → `external_llm` section

System 2 additions:
- `cancellation_checker: Callable[[], bool]` - Check during streaming to abort
- `action_callback` for emitting task events mid-stream
- Token counting and usage statistics

## Critical Timing Patterns (System 2 Frontend)

**Animation Choreography** (see `constants.js`):
- Agent creation: 800ms transition → Position updates at [100, 200, 300, 400, 500, 600, 700, 850]ms
- Task creation: Stagger by 200ms each → Connection lines stagger by 100ms each
- Reason: CSS transitions need time to complete before recalculating dependent positions
- **Pattern**: Schedule position updates throughout animation duration, not just at start/end

**Transition Control Flow**:
```javascript
// During drag or scroll (DragHandler/ScrollHandler):
1. transitionManager.disableAllTransitions()  // Immediate updates
2. Update positions (agents/tasks/connections)
3. setTimeout(() => transitionManager.enableAllTransitions(), 100)  // Re-enable after settling
```

## Rules

- Write code, not docs
- Follow existing service boundaries (don't mix concerns)
- **System isolation**: Don't import `components/` in `components2/` or vice versa (separate LLMService implementations)
- New features require mode/service pattern, not monolithic changes
- Config reloading is expected - design for live updates
- Test with both systems' web interfaces (`server.py` and `server2.py`)
- For System 2 frontend: Always inject dependencies via constructor, never use global state
- CSS transitions: Use TransitionManager for bulk control, constants.js for timing values
- WebSocket events flow through dedicated handlers - never bypass the handler layer
