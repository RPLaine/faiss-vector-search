# Streaming Server Request Guide

This guide shows how to use the streaming server with the Gemma model.

## Quick Start

### Server URL

The streaming server is available at:
```
https://www.northbeach.fi/dolphin/stream
```

## Making Requests

### Basic Streaming Request (Gemma)

```python
import aiohttp
import asyncio

async def chat_with_gemma():
    url = "https://www.northbeach.fi/dolphin/stream"
    
    payload = {
        "messages": [
            {"role": "user", "content": "Explain quantum computing in simple terms."}
        ],
        "model": "gemma",
        "temperature": 0.7,
        "top_p": 0.95,
        "top_k": 50,
        "max_tokens": 500
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as response:
            # Stream the response as plain text
            async for chunk in response.content.iter_any():
                if chunk:
                    text = chunk.decode('utf-8')
                    print(text, end='', flush=True)
            print()  # New line at end

asyncio.run(chat_with_gemma())
```

### Using cURL

```bash
curl -X POST https://www.northbeach.fi/dolphin/stream \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "messages": [
      {"role": "user", "content": "What is machine learning?"}
    ],
    "model": "gemma",
    "temperature": 0.7,
    "max_tokens": 300
  }'
```

Note: The `-N` flag disables buffering to see the streaming response in real-time.

### With System Message

Gemma handles system messages by prepending them to the first user message:

```python
payload = {
    "messages": [
        {"role": "system", "content": "You are a helpful AI assistant specialized in science."},
        {"role": "user", "content": "Explain photosynthesis."}
    ],
    "model": "gemma",
    "temperature": 0.8,
    "max_tokens": 400
}
```

### Multi-turn Conversation

```python
payload = {
    "messages": [
        {"role": "user", "content": "What is Python?"},
        {"role": "assistant", "content": "Python is a high-level programming language..."},
        {"role": "user", "content": "What can I use it for?"}
    ],
    "model": "gemma",
    "temperature": 0.7,
    "max_tokens": 300
}
```

## Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `messages` | array | **required** | Array of message objects with `role` and `content` |
| `model` | string | `"gemma"` | Model to use (e.g., `"gemma"`, `"qwen"`) |
| `temperature` | float | `0.7` | Sampling temperature (0.01-2.0) |
| `top_p` | float | `0.95` | Nucleus sampling threshold (0.01-1.0) |
| `top_k` | int | `50` | Top-k sampling (1-1000) |
| `max_tokens` | int | `500` | Maximum tokens to generate (1-20000) |
| `enable_thinking` | boolean | `false` | Enable thinking mode (Qwen only) |

## Response Format

The server streams the generated text directly as plain text without any wrapper format. 

### Plain Text Streaming

The response is sent as `text/plain` with chunks arriving as the model generates them:

```
Hello! Quantum computing is a revolutionary...
```

The text streams continuously until generation is complete. There are no special delimiters or metadata - just the pure generated content.

### Collecting the Full Response

```python
async with session.post(url, json=payload) as response:
    full_response = ""
    async for chunk in response.content.iter_any():
        if chunk:
            text = chunk.decode('utf-8')
            full_response += text
            print(text, end='', flush=True)
```

### Error Handling

Errors are returned as JSON with appropriate HTTP status codes:

```json
{
  "error": "Model not loaded"
}
```

Common error status codes:
- `400`: Invalid request (missing messages, invalid model)
- `500`: Server error (model loading failed, generation error)

## Switching Models

You can switch between models mid-session:

```python
# First request with Gemma
payload1 = {
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "gemma"
}

# Next request with Qwen (server will automatically switch)
payload2 = {
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "qwen"
}
```

The server will automatically unload the current model and load the new one.

## Health Check

Check if the server is running:

```bash
curl https://www.northbeach.fi/dolphin/
```

Response:
```json
{
  "status": "online",
  "current_model": "gemma",
  "available_models": ["gemma", "qwen"],
  "streaming_endpoint": "/stream",
  "timeout_seconds": 600
}
```

## Tips for Best Results

### Temperature Settings
- **0.1-0.3**: Focused, deterministic responses (good for factual questions)
- **0.7-0.9**: Balanced creativity and coherence (good for general chat)
- **1.0-1.5**: More creative and varied (good for creative writing)
- **>1.5**: Very random, may produce gibberish

### Token Limits
- Short answers: 50-200 tokens
- Paragraphs: 200-500 tokens
- Essays: 500-2000 tokens
- Long-form: 2000+ tokens

### Gemma-Specific Notes
- Gemma uses bfloat16 precision when supported
- System messages are automatically merged with the first user message
- Optimal temperature range: 0.7-1.0

## Example: Complete Chat Application

```python
import aiohttp
import asyncio
import time

async def stream_chat(message: str, history: list = None):
    """Stream a chat response from Gemma"""
    if history is None:
        history = []
    
    messages = history + [{"role": "user", "content": message}]
    
    payload = {
        "messages": messages,
        "model": "gemma",
        "temperature": 0.8,
        "top_p": 0.95,
        "max_tokens": 500
    }
    
    url = "https://www.northbeach.fi/dolphin/stream"
    response_text = ""
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as response:
            async for chunk in response.content.iter_any():
                if chunk:
                    text = chunk.decode('utf-8')
                    print(text, end='', flush=True)
                    response_text += text
            
            print()  # New line
    
    elapsed = time.time() - start_time
    print(f"[Generated in {elapsed:.2f}s]")
    
    return response_text

# Usage
async def main():
    history = []
    
    # First turn
    print("You: What is AI?")
    print("Assistant: ", end='', flush=True)
    response1 = await stream_chat("What is AI?", history)
    history.append({"role": "user", "content": "What is AI?"})
    history.append({"role": "assistant", "content": response1})
    
    # Second turn
    print("\nYou: How does it work?")
    print("Assistant: ", end='', flush=True)
    response2 = await stream_chat("How does it work?", history)
    history.append({"role": "user", "content": "How does it work?"})
    history.append({"role": "assistant", "content": response2})

asyncio.run(main())
```

## Testing

Use the provided test script:

```bash
python streaming_test.py
```

This will run health checks and streaming tests automatically.

## Troubleshooting

### Server Not Responding
- Check if server is running: `curl https://www.northbeach.fi/dolphin/`
- Verify network connectivity
- Check for firewall or proxy issues

### Slow Generation
- Lower `max_tokens` for faster responses
- Temperature/top_p/top_k don't affect speed
- Network latency may affect perceived speed
- The server logs detailed statistics (token count, speed) server-side only

### Connection Issues
- Ensure HTTPS is supported in your client
- Check for SSL certificate validation issues
- Verify no network proxy blocking the connection
- Use `iter_any()` for proper chunk iteration in aiohttp

## Implementation Notes

### Server-Side vs Client-Side

The server now returns **only the generated text** without metadata. This provides:
- Cleaner response format
- Lower bandwidth usage
- Simpler client implementation
- Direct text streaming

Performance metrics (token count, generation time, tokens/second) are logged server-side only and visible in the server console with rich formatting.

### Streaming Best Practices

1. **Use proper chunk iteration**: `response.content.iter_any()` in aiohttp
2. **Flush output**: Use `flush=True` in print statements for real-time display
3. **Handle encoding**: Always decode chunks with `utf-8`
4. **Collect full response**: Accumulate chunks if you need the complete text
5. **Measure client-side**: Calculate your own timing metrics if needed
