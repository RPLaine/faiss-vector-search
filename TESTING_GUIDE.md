# FAISS Retrieval Integration - Testing Guide

## Implementation Summary

Successfully integrated FAISS-based RAG retrieval into the AI Journalist system (System 2) with full UI visualization.

### Backend Components (Python)
- **components2/core/**: EmbeddingService, IndexService, SearchService (duplicated from System 1)
- **components2/faiss_retriever.py**: Dynamic threshold retrieval orchestrator
- **settings.json**: Added `retrieval` section with configuration
- **components2/task_executor.py**: Integrated retrieval before LLM execution
- **components2/workflow_executor.py**: Initializes retriever and passes to executor
- **server2.py**: Added 3 API endpoints for index management

### Frontend Components (JavaScript)
- **state/tool-manager.js**: State management for tool call nodes
- **renderers/tool-renderer.js**: Rendering with expand/collapse functionality
- **controllers/tool-controller.js**: Business logic for tool operations
- **handlers/websocket-event-handler.js**: Extended with 4 tool event handlers
- **ui/transition-manager.js**: Extended to support tool element transitions
- **ui/canvas-manager.js**: Added `updateElementPosition()` and tool position updates
- **ui/connection-lines-manager.js**: Added tool connection line methods
- **app.js**: Wired all tool components via dependency injection

### CSS Styling
- **public2/css/main.css**: Added comprehensive tool node styles
  - `.tool-node` with purple border and animations
  - `.tool-threshold-table` for progression display
  - `.tool-documents` for document list styling
  - `.tool-expand-toggle` for collapse/expand button
  - `.connection-line.tool-connection` for purple dashed connection lines

### Knowledge Base
- **data2/**: Created directory with 5 sample documents:
  1. `journalism_basics.txt` - 5 W's, inverted pyramid, lead writing
  2. `interview_techniques.txt` - Preparation, question types, best practices
  3. `fact_checking.txt` - Verification process, source evaluation
  4. `article_structure.txt` - Components, style guidelines, formatting
  5. `research_methods.txt` - Desk/field research, investigation strategies

## Testing Workflow

### Step 1: Enable Retrieval
Edit `settings.json`:
```json
{
  "retrieval": {
    "enabled": true,
    ...
  }
}
```

### Step 2: Start Server
```powershell
python server2.py
```

### Step 3: Build FAISS Index
In a new terminal:
```powershell
python build_index.py
```

Expected output:
- Connects to http://localhost:8001/api/retrieval/index/build
- Reads 5 .txt files from data2/
- Creates FAISS index at data2/faiss.index
- Creates metadata at data2/metadata.pkl

### Step 4: Open Web Interface
Navigate to: http://localhost:8001

### Step 5: Create Test Agent
1. Click "Add Agent" or "Create Agent"
2. Enter context: "Write an article about journalism best practices"
3. Set temperature: 0.7
4. Create agent

### Step 6: Observe Tool Nodes
Expected behavior:
1. **Task Creation**: Tasks appear in normal position
2. **Tool Call Start**: Purple tool node appears to the LEFT of task (WebSocket event: `tool_call_start`)
3. **Threshold Progression**: Table updates in real-time as FAISS searches (events: `tool_threshold_attempt`)
4. **Document Display**: Retrieved documents appear in tool node (event: `tool_call_complete`)
5. **Connection Lines**: Purple dashed line connects task → tool
6. **LLM Execution**: Task receives enhanced prompt with retrieved context
7. **Expand/Collapse**: Click toggle button to show/hide documents

## WebSocket Events Flow

```
Backend (task_executor.py) → WebSocket → Frontend (websocket-event-handler.js)
```

### Event Types
1. **tool_call_start**
   - Payload: `{agent_id, task_id, tool_type: "faiss_retrieval", query}`
   - Handler: Creates tool node, positions left of task, renders as "running"

2. **tool_threshold_attempt**
   - Payload: `{agent_id, task_id, threshold, hits, target}`
   - Handler: Updates threshold progression table in real-time
   - Emitted for each threshold step (1.0 → 0.95 → 0.90... until hit_target reached)

3. **tool_call_complete**
   - Payload: `{agent_id, task_id, documents: [{content, metadata, score}]}`
   - Handler: Populates document list, marks tool as "completed", changes border to green

4. **tool_call_failed**
   - Payload: `{agent_id, task_id, error}`
   - Handler: Marks tool as "failed", changes border to red, displays error

## Visual Layout

```
[Agent]  →  [Tool]  →  [Task]  →  [Tool]
         purple      gray         purple
         dashed                   dashed
```

- **Agent nodes**: Blue border, left side
- **Tool nodes**: Purple border, 320px wide, positioned 350px left of tasks
- **Task nodes**: Gray border, 900px wide
- **Connection lines**: Purple dashed for tools, gray/blue/green for agent-task

## Configuration Options

### settings.json - Retrieval Section
```json
{
  "retrieval": {
    "enabled": true,          // Toggle retrieval on/off
    "embedding_model": "TurkuNLP/sbert-cased-finnish-paraphrase",
    "dimension": 768,
    "index_path": "data2/",   // FAISS index directory
    "hit_target": 3,          // Stop when 3+ documents found
    "initial_threshold": 1.0,
    "min_threshold": 0.0,
    "threshold_step": 0.05    // Decrement by 0.05 each attempt
  }
}
```

### Dynamic Threshold Behavior
- Starts at threshold=1.0 (exact matches only)
- Decrements by 0.05 each iteration
- Stops when ≥3 documents found OR threshold reaches 0.0
- Real-time updates sent to UI via WebSocket

## Expected Results

### Successful Retrieval Example
For query: "How to write a good lead paragraph"

Expected documents:
1. `journalism_basics.txt` (score: 0.85) - Contains lead writing section
2. `article_structure.txt` (score: 0.78) - Discusses lead paragraphs
3. `interview_techniques.txt` (score: 0.65) - Mentions preparation

### UI Visualization
- Tool node appears with "🔍 FAISS Retrieval" title
- Query displayed in purple box
- Threshold table shows progression (e.g., 1.0→0, 0.95→0, 0.90→0, 0.85→3 ✓)
- 3 documents listed with scores, sources, and content preview
- LLM receives enhanced prompt with these documents as "Knowledge Base Context"

## Troubleshooting

### No tool nodes appear
- Check `settings.json` → `retrieval.enabled` is `true`
- Verify FAISS index exists: `data2/faiss.index` and `data2/metadata.pkl`
- Check browser console for WebSocket events
- Check server logs for retrieval execution

### Connection line not showing
- Verify `ConnectionLinesManager` has `toolManager` injected
- Check `app.js` passes `toolManager` to `CanvasManager`
- Inspect SVG element for path with class `.connection-line.tool-connection`

### Documents not displaying
- Expand tool node (click ▼ button)
- Check `tool_call_complete` event in browser console
- Verify documents array is populated in event payload

### Index build fails
- Ensure all .txt files exist in `data2/`
- Check server is running on port 8001
- Verify `sentence-transformers` is installed
- Check disk space for index files

## Next Steps

1. Test with different agent contexts
2. Verify retrieval quality with various queries
3. Test expand/collapse animations
4. Monitor performance with larger knowledge bases
5. Add more documents to data2/ and rebuild index
