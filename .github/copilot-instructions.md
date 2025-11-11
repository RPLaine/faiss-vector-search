# GitHub Copilot Instructions

## NO DOCUMENTATION UNLESS ASKED

**Do not create .md files, README, CHANGELOG, summaries, or documentation automatically.**

Only create documentation when explicitly requested.

## Architecture Overview

**FAISS-based RAG System with External LLM Integration**

Three execution modes (mode-based architecture):
- `none`: Direct LLM without retrieval
- `faiss`: Dynamic threshold retrieval + single LLM call  
- `full`: Complete pipeline (retrieval + temperature optimization + iterative improvement)

### Component Structure

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
  ├── rag_system.py  # Main orchestrator, coordinates all services
  └── session_manager.py, ui_components.py
```

**Key Design Patterns:**
- Service-oriented architecture: RAGSystem orchestrates specialized services
- Mode pattern: BaseMode → concrete mode implementations with `execute()` method
- Lazy loading: QueryExecutor initialized on first use to avoid circular imports
- Progress callbacks: Dual system (CLI via Rich, Web via JSON events to WebSocket)

### Data Flow

1. **Index Building** (offline): `preprocessing/process_docx_files.py` → `preprocessing/chunk_text_files.py` → writes to `files/` directory
2. **Querying** (runtime): 
   - CLI: `main.py` → QueryRunner → RAGSystem
   - Web: `server.py` → RAGController → RAGSystem
   - Both use same mode-based execution via QueryExecutor

## Critical Developer Workflows

### Running the System

```powershell
# Web UI (recommended - includes API + WebSocket + GUI)
python server.py
# Access: http://localhost:8000

# CLI mode (terminal-based querying)
python main.py --data-dir data

# Index building workflow (3 steps)
python preprocessing/process_docx_files.py  # Step 1: Convert DOCX from unprocessed/ → Markdown TXT in txt-files/
python preprocessing/chunk_text_files.py    # Step 2: Chunk text files → files/
# Step 3: Add to FAISS index via web UI or programmatically
```

### Configuration

All runtime behavior controlled by `config.json` (NOT `config_example.json`):
- `retrieval.hit_target`: Dynamic threshold stops when this many docs found
- `retrieval.step`: Threshold adjustment increment (e.g., 0.01)
- `optimization.enabled`: Enable/disable temperature testing
- `improvement.enabled`: Enable/disable iterative refinement

**Config is reloaded on each query** - no server restart needed for tuning.

## Technology Stack

- **Backend**: Python 3.9+, FastAPI, FAISS (faiss-cpu), sentence-transformers (TurkuNLP/sbert-cased-finnish-paraphrase)
- **Frontend**: Vanilla JavaScript ES6 modules (no frameworks)
- **Communication**: REST API + WebSocket for real-time progress updates

## Code Conventions

**Python:**
- Type hints mandatory (e.g., `def search(query: str, k: int) -> List[str]`)
- Service classes use dependency injection
- Exceptions: Custom hierarchy in `components/exceptions.py` (RAGException → ConfigurationError, EmbeddingError, etc.)
- Async: FastAPI endpoints are `async def`, core logic is synchronous (runs in ThreadPoolExecutor)
- Logging: Use `logger = logging.getLogger(__name__)` pattern

**JavaScript:**
- ES6 modules with explicit imports/exports
- Singleton pattern for services: `export const apiService = new APIService()`
- State management: Centralized in `state.js` with subscription pattern
- No jQuery, React, or Vue - pure DOM manipulation via `ui/dom-builder.js`

**Progress Events:**
- CLI: Pass `ui_callback` object with methods like `display_threshold_attempt(threshold, hits, target)`
- Web: Pass `json_callback` function that emits JSON to WebSocket (see `WEBSOCKET_EVENTS.md`)
- Both callbacks are optional parameters throughout the stack

## Integration Points

### Adding New Query Modes

1. Create `components/modes/my_mode.py` inheriting `BaseMode`
2. Implement: `execute()`, `get_mode_name()`, `get_mode_description()`, `validate_config()`
3. Register in `components/execution/mode_selector.py`

### WebSocket Events

All real-time updates flow through `server.py:broadcast_progress()`. Event structure:
```json
{
  "type": "retrieval_start|threshold_attempt|temperature_test|...",
  "timestamp": "ISO-8601",
  "data": { /* event-specific payload */ }
}
```

Handler: `public/js/handlers/websocket-messages.js` with method per event type.

**Missing implementations** (see WEBSOCKET_EVENTS.md): `threshold_attempt`, `temperature_test`, `temperature_evaluation`, `improvement_iteration` events are CLI-only. Need JSON emission via `json_callback`.

### External LLM API

LLMService (`components/services/llm_service.py`) abstracts API calls:
- Supports streaming (chunks via `progress_callback`)
- Custom headers, timeouts, payload formats
- Retry logic and error handling
- Used by all modes, optimization, and improvement components

## Rules

- Write code, not docs
- Follow existing service boundaries (don't mix concerns)
- New features require mode/service pattern, not monolithic changes
- Config reloading is expected - design for live updates
- Test with both CLI (`main.py`) and Web (`server.py`) interfaces
- WebSocket events must be documented in `WEBSOCKET_EVENTS.md` before implementing
