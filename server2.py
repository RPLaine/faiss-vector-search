"""
AI Journalist Agents Demo Server

A presentation-focused server that demonstrates multiple AI agents
working in parallel to write articles using the LLM service.

Uses the same backend components as the main RAG system but with
a different UI focused on multi-agent visualization.

Usage:
    python server2.py
"""

import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Any, List, Optional
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import uuid

from components.services import ConfigurationProvider, LLMService
from components2 import AgentManager, WorkflowExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Thread pool for running LLM operations
executor = ThreadPoolExecutor(max_workers=8)  # Support multiple concurrent agents

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Store the main event loop
main_loop: Optional[asyncio.AbstractEventLoop] = None

# Services (initialized during startup)
config_provider: Optional[ConfigurationProvider] = None
llm_service: Optional[LLMService] = None
agent_manager: Optional[AgentManager] = None
workflow_executor: Optional[WorkflowExecutor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    global main_loop, config_provider, llm_service, agent_manager, workflow_executor
    
    # Startup
    main_loop = asyncio.get_running_loop()
    logger.info("Initializing AI Journalist Demo system...")
    
    try:
        # Initialize configuration
        config_provider = ConfigurationProvider.from_file("config.json")
        
        # Initialize LLM service
        llm_service = LLMService(config_provider.get_llm_config())
        
        # Initialize agent manager
        agent_manager = AgentManager()
        
        # Initialize workflow executor
        workflow_executor = WorkflowExecutor(llm_service, executor, main_loop)
        
        logger.info("AI Journalist Demo system initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize system: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Journalist Demo system...")
    executor.shutdown(wait=True)


# Initialize FastAPI app
app = FastAPI(
    title="AI Journalist Agents Demo",
    description="Multi-agent AI journalist presentation system",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def broadcast_event(data: Dict[str, Any]):
    """Broadcast event to all WebSocket clients."""
    if not active_connections:
        return
        
    logger.info(f"Broadcasting to {len(active_connections)} clients: {data.get('type', 'unknown')}")
    
    for connection in active_connections:
        try:
            await connection.send_json(data)
        except Exception as e:
            logger.warning(f"Failed to send event: {e}")


# API Endpoints

@app.get("/api")
async def api_info():
    """API information endpoint."""
    return {
        "name": "AI Journalist Agents Demo API",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "llm_service": "ok",
            "config_provider": "ok"
        }
    }


@app.post("/api/agents/create")
async def create_agent(agent_data: Dict[str, Any]):
    """
    Create a new AI journalist agent.
    
    Request body:
        {
            "name": "Agent Name",
            "context": "Additional context/guidance (optional)",
            "style": "writing style (optional)",
            "temperature": 0.7 (optional)
        }
    """
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    try:
        # Create agent using agent_manager
        agent = agent_manager.create_agent(
            name=agent_data.get("name"),
            context=agent_data.get("context", ""),
            style=agent_data.get("style", "professional journalism"),
            temperature=agent_data.get("temperature", 0.7)
        )
        
        # Broadcast agent creation
        await broadcast_event({
            "type": "agent_created",
            "data": agent
        })
        
        return agent
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/{agent_id}/start")
async def start_agent(agent_id: str):
    """Start an agent's article writing process."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    if not agent_manager.agent_exists(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.get("status") == "running":
        raise HTTPException(status_code=409, detail="Agent is already running")
    
    # Update status
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast start event
    await broadcast_event({
        "type": "agent_started",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"]
        }
    })
    
    # Run agent in background
    loop = asyncio.get_event_loop()
    task = loop.create_task(run_agent(agent_id))
    agent_manager.set_agent_task(agent_id, task)
    
    return {"success": True, "agent_id": agent_id}


async def run_agent(agent_id: str):
    """Run an AI journalist agent to write an article."""
    if not agent_manager or not workflow_executor:
        logger.error("Services not initialized")
        return
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        return
    
    async def phase_callback(phase: int, status: str, content: Optional[str] = None):
        """Callback for phase updates."""
        event_data = {
            "type": "workflow_phase",
            "timestamp": datetime.now().isoformat(),
            "data": {"agent_id": agent_id, "phase": phase, "status": status}
        }
        
        if content:
            event_data["data"]["content"] = content
        
        await broadcast_event(event_data)
    
    def chunk_callback(phase: int, chunk: str):
        """Callback for streaming chunks."""
        if main_loop and active_connections:
            event_type = "phase_chunk" if phase == 0 else "agent_chunk"
            asyncio.run_coroutine_threadsafe(
                broadcast_event({
                    "type": event_type,
                    "data": {
                        "agent_id": agent_id,
                        "phase": phase,
                        "chunk": chunk
                    }
                }),
                main_loop
            )
    
    def action_callback(action_data: Dict[str, Any]):
        """Callback for action events."""
        if main_loop and active_connections:
            action_data["agent_id"] = agent_id
            asyncio.run_coroutine_threadsafe(
                broadcast_event(action_data),
                main_loop
            )
    
    try:
        # Execute workflow
        result = await workflow_executor.execute_workflow(
            agent=agent,
            phase_callback=phase_callback,
            chunk_callback=chunk_callback,
            action_callback=action_callback
        )
        
        # Update agent with results
        agent_manager.update_agent_status(
            agent_id,
            "completed",
            subject=result["subject"],
            article=result["article"],
            word_count=result["word_count"],
            generation_time=result["generation_time"]
        )
        
        # Broadcast completion
        await broadcast_event({
            "type": "agent_completed",
            "data": {
                "agent_id": agent_id,
                "name": agent["name"],
                "article": result["article"],
                "word_count": result["word_count"],
                "generation_time": result["generation_time"]
            }
        })
        
    except Exception as e:
        logger.error(f"Agent {agent_id} failed: {e}")
        agent_manager.update_agent_status(agent_id, "failed", error=str(e))
        
        await broadcast_event({
            "type": "agent_failed",
            "data": {
                "agent_id": agent_id,
                "name": agent["name"],
                "error": str(e)
            }
        })


@app.get("/api/agents")
async def list_agents():
    """List all agents."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agents = agent_manager.list_agents()
    return {
        "agents": agents,
        "total": len(agents)
    }


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get agent details."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return agent


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    if not agent_manager.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Broadcast deletion
    await broadcast_event({
        "type": "agent_deleted",
        "data": {"agent_id": agent_id}
    })
    
    return {"success": True, "agent_id": agent_id}


@app.post("/api/agents/clear")
async def clear_agents():
    """Clear all completed agents."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    cleared = agent_manager.clear_completed_agents()
    
    await broadcast_event({
        "type": "agents_cleared",
        "data": {"count": cleared}
    })
    
    return {"success": True, "cleared": cleared}


# WebSocket Endpoint

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    active_connections.append(websocket)
    
    logger.info(f"WebSocket client connected. Total connections: {len(active_connections)}")
    
    try:
        # Send initial state
        agents = agent_manager.list_agents() if agent_manager else []
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "agents": agents,
                "timestamp": datetime.now().isoformat()
            }
        })
        
        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            })
            
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
        logger.info(f"WebSocket connection closed. Remaining: {len(active_connections)}")


# Error handlers

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom HTTP exception handler."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now().isoformat()
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """General exception handler."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )


# Mount static files
public_dir = Path(__file__).parent / "public2"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")
    logger.info(f"Serving static files from: {public_dir}")
else:
    logger.warning(f"Public directory not found: {public_dir}")


if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading
    import argparse
    import signal
    import sys
    
    parser = argparse.ArgumentParser(description="AI Journalist Agents Demo Server")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8001, help="Port to bind to")
    args = parser.parse_args()
    
    print("=" * 70)
    print("📰 AI Journalist Agents Demo")
    print("=" * 70)
    print(f"Server starting on http://localhost:{args.port}")
    print(f"Serving static files from: {public_dir}")
    print()
    print("Press Ctrl+C to stop the server")
    print("=" * 70)
    print()
    
    # Set up signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        print("\n\nShutting down server...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    if not args.no_browser:
        def open_browser():
            import time
            time.sleep(1.5)
            webbrowser.open(f"http://localhost:{args.port}")
        
        threading.Thread(target=open_browser, daemon=True).start()
    
    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        print("Cleanup complete.")
