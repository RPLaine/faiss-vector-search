# Configuration Reference

This document describes all configurable parameters in `config.json`.

## External LLM Configuration (`external_llm`)

Controls the LLM API used for response generation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | Primary LLM API endpoint URL |
| `model` | string | required | Model identifier for the LLM |
| `payload_type` | string | `"message"` | API payload format (`"message"` or other) |
| `timeout` | integer | `300` | Request timeout in seconds |
| `max_tokens` | integer | `1000` | Maximum tokens for LLM responses |
| `temperature` | float | `0.5` | LLM temperature (0.0-2.0, controls creativity) |
| `headers` | object | `{}` | HTTP headers for API requests (auth, content-type) |

## Embedding Configuration (`embedding`)

Controls the embedding model for semantic search.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | required | Sentence-BERT model name (e.g., `TurkuNLP/sbert-cased-finnish-paraphrase`) |
| `dimension` | integer | `768` | Embedding vector dimension (must match model) |
| `batch_size` | integer | `256` | Batch size for encoding documents |

## Retrieval Configuration (`retrieval`)

Controls FAISS document retrieval behavior.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hit_target` | integer | `3` | Target number of documents to retrieve (enables dynamic threshold) |
| `step` | float | `0.01` | Step size for dynamic threshold adjustment |
| `top_k` | integer | `20` | Maximum number of documents to search |
| `similarity_threshold` | float | `0.55` | Minimum similarity score (0.0-1.0, used as fallback) |
| `max_context_length` | integer | `10000` | Maximum context length in characters |

**Note:** When `hit_target` is set, the system uses dynamic threshold adjustment. It starts at 1.0 and decrements by `step` until `hit_target` documents are found.

## Index Configuration (`index`)

Controls FAISS index storage and type.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `"IndexFlatIP"` | FAISS index type (`IndexFlatIP` for inner product, `IndexFlatL2` for L2 distance) |
| `save_path` | string | `"data/faiss.index"` | Path to save/load FAISS index |
| `metadata_path` | string | `"data/metadata.pkl"` | Path to save/load document metadata |

**Note:** `IndexFlatIP` requires normalized vectors and computes cosine similarity.

## Optimization Configuration (`optimization`)

Controls adaptive temperature optimization using LLM self-evaluation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable optimization mode |
| `temperature_values` | array | `[0.25, 0.5, 0.75, 1.0, 1.25]` | Temperature values to test |

### Evaluator Sub-configuration (`optimization.evaluator`)

Controls the LLM-based evaluation of responses.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `temperature` | float | `0.1` | Low temperature for consistent evaluation scoring |
| `max_tokens` | integer | `500` | Maximum tokens for evaluation response (reasoning + score) |
| `timeout` | integer | `60` | Timeout for evaluation requests in seconds |

**Note:** These settings override the main `external_llm` settings for evaluation requests only. Lower temperature ensures consistent scoring, while sufficient max_tokens allows for detailed reasoning.

## Configuration Inheritance

The optimization evaluator inherits settings from `external_llm` and overrides them with `optimization.evaluator` settings:

```
evaluator_config = external_llm + optimization.evaluator
```

This means:
- `url`, `model`, `headers` come from `external_llm`
- `temperature`, `max_tokens`, `timeout` use `optimization.evaluator` if specified

## Example: Minimal Configuration

```json
{
    "external_llm": {
        "url": "https://api.example.com/v1/chat/completions",
        "model": "your-model-id",
        "timeout": 300,
        "max_tokens": 1000,
        "temperature": 0.5
    },
    "embedding": {
        "model": "TurkuNLP/sbert-cased-finnish-paraphrase",
        "dimension": 768
    },
    "retrieval": {
        "hit_target": 3,
        "top_k": 20
    },
    "index": {
        "type": "IndexFlatIP"
    },
    "optimization": {
        "enabled": true,
        "temperature_values": [0.25, 0.5, 0.75, 1.0, 1.25],
        "evaluator": {
            "temperature": 0.1,
            "max_tokens": 500,
            "timeout": 60
        }
    }
}
```

## Runtime Configuration Reload

The system reloads `retrieval` configuration before each search operation, allowing dynamic parameter changes without restart.
