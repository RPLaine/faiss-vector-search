# AI Journalist Agents Demo

A presentation-focused demonstration system showing multiple AI agents writing articles in parallel using LLM streaming.

## Overview

This is a secondary project that shares the Python backend components from the main FAISS system but provides a completely different UI focused on visualizing multiple AI agents working simultaneously.

## Features

- **Multi-Agent Parallel Processing**: Create multiple journalist agents that write articles concurrently
- **Real-Time Streaming**: Watch articles being written live as the LLM generates text
- **Side-by-Side Cards**: Agent cards appear next to each other in a responsive grid layout
- **Professional Presentation**: Clean, modern UI suitable for demos and presentations
- **Flexible Configuration**: Customize agent writing style, temperature, and topics

## Architecture

### Backend (Python)
- **server2.py**: FastAPI server on port 8001
- Uses shared components from `components/` directory:
  - `services/llm_service.py` - LLM API integration with streaming
  - `services/config_provider.py` - Configuration management
- Independent from the main RAG system (no FAISS, no retrieval)

### Frontend (JavaScript)
- **public2/**: Separate UI directory
- Vanilla JavaScript ES6 modules (no frameworks)
- WebSocket-based real-time updates
- Responsive grid layout for agent cards

## Running the Demo

```bash
# Start the demo server (port 8001)
python server2.py

# Or without auto-opening browser
python server2.py --no-browser

# Custom port
python server2.py --port 8002
```

Access the demo at: `http://localhost:8001`

## Usage

1. **Create an Agent**:
   - Click "Create New Agent"
   - Enter agent name (e.g., "Tech Reporter")
   - Specify article topic
   - Choose writing style
   - Adjust creativity (temperature)
   - Click "Create & Start"

2. **Watch the Magic**:
   - Agent cards appear in the grid
   - Articles stream in real-time
   - Multiple agents work simultaneously
   - Cards show status, word count, and generation time

3. **Manage Agents**:
   - Delete individual agents
   - Clear all completed agents
   - View statistics (active, completed, total)

## Configuration

The demo uses `config.json` for LLM settings:

```json
{
  "external_llm": {
    "url": "http://your-llm-server/api/generate",
    "model": "your-model-name",
    "temperature": 0.7,
    "max_tokens": 1000
  }
}
```

## Differences from Main System

| Feature | Main System (server.py) | Demo System (server2.py) |
|---------|------------------------|--------------------------|
| Port | 8000 | 8001 |
| UI Directory | public/ | public2/ |
| Purpose | RAG queries with retrieval | AI agent demonstration |
| Features | FAISS, optimization, improvement | Multi-agent, streaming |
| Layout | Single query/response | Grid of concurrent agents |
| Complexity | Full pipeline | Simple LLM calls |

## API Endpoints

- `POST /api/agents/create` - Create new agent
- `POST /api/agents/{id}/start` - Start agent article generation
- `GET /api/agents` - List all agents
- `GET /api/agents/{id}` - Get agent details
- `DELETE /api/agents/{id}` - Delete agent
- `POST /api/agents/clear` - Clear completed agents
- `WS /ws` - WebSocket for real-time updates

## WebSocket Events

- `agent_created` - New agent added
- `agent_started` - Agent begins writing
- `agent_chunk` - Text chunk from streaming LLM
- `agent_completed` - Article finished
- `agent_failed` - Error occurred
- `agent_deleted` - Agent removed

## Use Cases

- **Live Demonstrations**: Show AI capabilities in presentations
- **Content Generation**: Generate multiple articles simultaneously
- **Writing Styles**: Compare different styles/temperatures side-by-side
- **Educational**: Visualize how LLMs generate text progressively
- **Performance Testing**: Stress-test LLM API with concurrent requests

## Development

The demo is designed to be:
- **Independent**: Runs separately from main system
- **Reusable**: Shares components but has own UI/server
- **Extensible**: Easy to add new agent types or features
- **Presentation-Ready**: Clean, professional appearance

## Notes

- Agents run in thread pool (8 max concurrent by default)
- Each agent is a separate LLM API call
- Streaming chunks are broadcast via WebSocket
- No data persistence - agents cleared on server restart
- No RAG/retrieval - just direct LLM prompts
