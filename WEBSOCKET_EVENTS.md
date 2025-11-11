# WebSocket Event Specification for Web UI

This document defines all real-time events that should be emitted from the backend to the web UI via WebSocket.

## Event Structure

All events follow this structure:
```json
{
  "type": "event_type",
  "timestamp": "2025-11-06T12:34:56",
  "data": { /* event-specific data */ }
}
```

## 1. Query Lifecycle Events

### query_start
```json
{
  "type": "query_start",
  "timestamp": "...",
  "data": {
    "query": "User's question",
    "mode": "full|faiss|none"
  }
}
```

### query_complete
```json
{
  "type": "query_complete",
  "timestamp": "...",
  "data": {
    "processing_time": 5.23,
    "num_docs_found": 3,
    "response": "Final answer text"
  }
}
```

## 2. Dynamic Retrieval Events

### retrieval_start
```json
{
  "type": "retrieval_start",
  "timestamp": "...",
  "data": {
    "hit_target": 3,
    "top_k": 20
  }
}
```

### threshold_attempt
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "threshold_attempt",
  "timestamp": "...",
  "data": {
    "threshold": 0.950,
    "hits": 0,
    "target": 3,
    "target_reached": false
  }
}
```

### retrieval_complete
```json
{
  "type": "retrieval_complete",
  "timestamp": "...",
  "data": {
    "num_docs": 3,
    "threshold_used": 0.520,
    "retrieval_time": 0.15
  }
}
```

## 3. Temperature Optimization Events

### optimization_start
```json
{
  "type": "optimization_start",
  "timestamp": "...",
  "data": {
    "temperatures": [0.25, 0.5, 0.75, 1.0, 1.25]
  }
}
```

### temperature_test
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "temperature_test",
  "timestamp": "...",
  "data": {
    "temperature": 0.75,
    "test_number": 3,
    "total_tests": 5
  }
}
```

### temperature_response
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "temperature_response",
  "timestamp": "...",
  "data": {
    "temperature": 0.75,
    "response": "Generated response text...",
    "generation_time": 2.1
  }
}
```

### temperature_evaluation
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "temperature_evaluation",
  "timestamp": "...",
  "data": {
    "temperature": 0.75,
    "score": 0.82,
    "reasoning": "Evaluation reasoning text...",
    "evaluation_time": 0.5
  }
}
```

### optimization_complete
```json
{
  "type": "optimization_complete",
  "timestamp": "...",
  "data": {
    "best_temperature": 0.75,
    "best_score": 0.82,
    "total_time": 15.3
  }
}
```

## 4. Response Improvement Events

### improvement_start
```json
{
  "type": "improvement_start",
  "timestamp": "...",
  "data": {
    "initial_score": 0.82,
    "target_score": 1.0
  }
}
```

### improvement_iteration
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "improvement_iteration",
  "timestamp": "...",
  "data": {
    "iteration": 1,
    "action": "improving"  // or "evaluating"
  }
}
```

### improvement_response
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "improvement_response",
  "timestamp": "...",
  "data": {
    "iteration": 1,
    "response": "Improved response text...",
    "generation_time": 2.3
  }
}
```

### improvement_evaluation
**NEW - Currently CLI-only, needs JSON emission**
```json
{
  "type": "improvement_evaluation",
  "timestamp": "...",
  "data": {
    "iteration": 1,
    "score": 0.85,
    "score_change": 0.03,
    "reasoning": "Evaluation reasoning...",
    "is_improvement": true
  }
}
```

### improvement_complete
```json
{
  "type": "improvement_complete",
  "timestamp": "...",
  "data": {
    "final_score": 0.85,
    "iterations": 2,
    "stopped_reason": "Convergence at iteration 2"
  }
}
```

## 5. Document Events

### documents_retrieved
```json
{
  "type": "documents_retrieved",
  "timestamp": "...",
  "data": {
    "num_docs": 3,
    "documents": [
      {
        "content": "Document text...",
        "score": 0.92,
        "filename": "file1.txt"
      }
    ]
  }
}
```

## Implementation Checklist

- [x] query_start, query_complete - Already implemented
- [x] retrieval_start, retrieval_complete - Already implemented
- [x] documents_retrieved - Already implemented
- [ ] **threshold_attempt** - Needs implementation
- [ ] **temperature_test** - Needs implementation
- [ ] **temperature_response** - Needs implementation
- [ ] **temperature_evaluation** - Needs implementation
- [ ] **improvement_iteration** - Needs implementation
- [ ] **improvement_response** - Needs implementation
- [ ] **improvement_evaluation** - Needs implementation

## Frontend Handler Mapping

Each event type should have a corresponding handler in `public/js/handlers/websocket-messages.js`:

```javascript
handleThresholdAttempt(data) {
  // Display: "🔍 Threshold 0.950: 0 hits (target: 3) ✗"
}

handleTemperatureTest(data) {
  // Display: "🌡️  Testing Temperature: 0.75 (3/5)"
}

handleTemperatureResponse(data) {
  // Display response in collapsible panel
}

handleTemperatureEvaluation(data) {
  // Display: "📊 Score: 0.82 (+0.05)"
}

handleImprovementIteration(data) {
  // Display: "🔄 Iteration 1: Improving..."
}

handleImprovementResponse(data) {
  // Display improved response in panel
}

handleImprovementEvaluation(data) {
  // Display: "✅ Improvement! Score: 0.82 → 0.85 (+0.03)"
}
```
