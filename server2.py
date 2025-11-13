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

from components.services import ConfigurationProvider
from components2.llm_service import LLMService
from components2 import AgentManager, WorkflowExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Suppress uvicorn access logs for specific endpoints
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Suppress Chrome DevTools well-known endpoint
        return "/.well-known/appspecific/com.chrome.devtools.json" not in record.getMessage()

# Apply filter to uvicorn access logger
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

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
        
        # Broadcast server online status after a short delay to allow connections
        async def broadcast_online():
            await asyncio.sleep(1)  # Wait for initial connections
            await broadcast_event({
                "type": "server_online",
                "data": {
                    "timestamp": datetime.now().isoformat(),
                    "message": "Server restarted and ready"
                }
            })
        
        asyncio.create_task(broadcast_online())
        
    except Exception as e:
        logger.error(f"Failed to initialize system: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Journalist Demo system...")
    
    # Broadcast server offline status
    await broadcast_event({
        "type": "server_offline",
        "data": {
            "timestamp": datetime.now().isoformat(),
            "message": "Server shutting down"
        }
    })
    
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
            temperature=agent_data.get("temperature", 0.7),
            auto=agent_data.get("auto", False)
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
async def start_agent(agent_id: str, request_data: Optional[Dict[str, Any]] = None):
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
    
    # Get halt setting from request
    request_data = request_data or {}
    halt = request_data.get("halt", False)
    agent["halt"] = halt
    agent["current_phase"] = -1  # Not started yet
    
    # Clear previous responses
    agent.pop("phase_0_response", None)
    agent.pop("tasklist", None)
    agent.pop("goal", None)
    
    # Update status
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast start event
    await broadcast_event({
        "type": "agent_started",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"],
            "halt": halt
        }
    })
    
    # Run agent in background
    loop = asyncio.get_event_loop()
    task = loop.create_task(run_agent(agent_id))
    agent_manager.set_agent_task(agent_id, task)
    
    return {"success": True, "agent_id": agent_id, "halt": halt}


@app.post("/api/agents/{agent_id}/continue")
async def continue_agent(agent_id: str):
    """Continue a halted agent to the next phase."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.get("status") != "halted":
        raise HTTPException(status_code=409, detail="Agent is not halted")
    
    # Clear the halt flag to allow execution to continue
    agent["halt"] = False
    
    # Update status back to running
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast continue event
    await broadcast_event({
        "type": "agent_continued",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"]
        }
    })
    
    # Restart the workflow from the halted phase
    # This will continue execution from where it left off
    asyncio.create_task(run_agent(agent_id))
    
    return {"success": True, "agent_id": agent_id}


@app.post("/api/agents/{agent_id}/halt")
async def update_halt_state(agent_id: str, request_data: Dict[str, Any]):
    """Update the halt state of an agent (can be toggled during execution)."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update halt state
    halt = request_data.get("halt", False)
    agent["halt"] = halt
    
    # Save to persistent store
    agent_manager._save_state()
    
    logger.info(f"Agent {agent_id} halt state updated to: {halt}")
    
    return {"success": True, "agent_id": agent_id, "halt": halt}


@app.post("/api/agents/{agent_id}/auto")
async def update_auto_state(agent_id: str, request_data: Dict[str, Any]):
    """Update the auto-restart state of an agent without broadcasting."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update auto state
    auto = request_data.get("auto", False)
    agent["auto"] = auto
    
    # Save to persistent store
    agent_manager._save_state()
    
    logger.info(f"Agent {agent_id} auto state updated to: {auto}")
    
    return {"success": True, "agent_id": agent_id, "auto": auto}


@app.post("/api/agents/{agent_id}/expand")
async def update_expand_state(agent_id: str, request_data: Dict[str, Any]):
    """Update the expand state of an agent without broadcasting."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update expand state
    expanded = request_data.get("expanded", False)
    agent["expanded"] = expanded
    
    # Save to persistent store
    agent_manager._save_state()
    
    logger.info(f"Agent {agent_id} expand state updated to: {expanded}")
    
    return {"success": True, "agent_id": agent_id, "expanded": expanded}


@app.post("/api/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    """Stop a running agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.get("status") != "running":
        raise HTTPException(status_code=409, detail="Agent is not running")
    
    # Set cancellation flag (checked by LLM service)
    agent["cancelled"] = True
    
    # Cancel the task
    task = agent.get("task")
    if task and not task.done():
        task.cancel()
        logger.info(f"Cancelled task for agent {agent_id}")
    
    # Update status
    agent_manager.update_agent_status(agent_id, "created")
    
    # Broadcast stop event
    await broadcast_event({
        "type": "agent_stopped",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"]
        }
    })
    
    return {"success": True, "agent_id": agent_id}


@app.post("/api/agents/{agent_id}/redo")
async def redo_phase(agent_id: str, request_data: Dict[str, Any]):
    """Redo the current phase of a halted agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.get("status") != "halted":
        raise HTTPException(status_code=409, detail="Agent is not halted")
    
    # Get current phase to redo
    current_phase = agent.get("current_phase", 0)
    
    # Clear the response for the phase being redone
    if current_phase == 0:
        agent.pop("phase_0_response", None)
        agent.pop("tasklist", None)
        agent.pop("goal", None)
    
    # Set the phase to redo (workflow will check this and re-execute that phase)
    agent["redo_phase"] = current_phase
    
    # Update status to running
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast redo event
    await broadcast_event({
        "type": "agent_redo",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"],
            "phase": current_phase
        }
    })
    
    # Restart the workflow to redo the phase
    asyncio.create_task(run_agent(agent_id))
    
    return {"success": True, "agent_id": agent_id, "phase": current_phase}


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
        
        # Include tasklist when phase 0 completes
        if phase == 0 and status == "completed" and agent.get("tasklist"):
            event_data["data"]["tasklist"] = agent["tasklist"]
        
        await broadcast_event(event_data)
        
        # Save to persistent store after phase completes
        if status == "completed" and agent_manager:
            agent_manager._save_state()
    
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
    
    async def action_callback(action_data: Dict[str, Any]):
        """Callback for action events (including task events)."""
        if main_loop and active_connections:
            # Ensure agent_id is in the event data
            if "agent_id" not in action_data:
                action_data["agent_id"] = agent_id
            
            await broadcast_event(action_data)
    
    try:
        # Execute workflow
        result = await workflow_executor.execute_workflow(
            agent=agent,
            phase_callback=phase_callback,
            chunk_callback=chunk_callback,
            action_callback=action_callback
        )
        
        logger.info(f"Workflow result for agent {agent_id}: {result}")
        
        # Check if halted
        if result.get("halted"):
            logger.info(f"Agent {agent_id} halted at phase {result.get('phase', -1)}")
            agent_manager.update_agent_status(agent_id, "halted")
            
            logger.info(f"Broadcasting agent_halted event for {agent_id}")
            await broadcast_event({
                "type": "agent_halted",
                "data": {
                    "agent_id": agent_id,
                    "name": agent["name"],
                    "phase": result.get("phase", -1)
                }
            })
            logger.info(f"agent_halted event broadcasted for {agent_id}")
            return
        
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
        
        # Check if auto-restart is enabled
        if agent.get("auto", False):
            # Small delay before restarting
            await asyncio.sleep(2)
            
            # Reset agent state for restart
            agent["halt"] = agent.get("halt", False)
            agent["current_phase"] = -1
            agent["continue"] = False
            
            # Update status to running
            agent_manager.update_agent_status(agent_id, "running")
            
            # Broadcast auto-restart event
            await broadcast_event({
                "type": "agent_auto_restart",
                "data": {
                    "agent_id": agent_id,
                    "name": agent["name"]
                }
            })
            
            # Restart the agent
            await run_agent(agent_id)
        
    except asyncio.CancelledError:
        logger.info(f"Agent {agent_id} was cancelled")
        agent_manager.update_agent_status(agent_id, "created")
        # Don't broadcast - already handled by stop endpoint
        
    except Exception as e:
        # Check if it's a cancellation exception
        if "cancelled" in str(e).lower() or agent.get("cancelled", False):
            logger.info(f"Agent {agent_id} was cancelled during LLM call")
            agent_manager.update_agent_status(agent_id, "created")
            # Don't broadcast - already handled by stop endpoint
        else:
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


@app.put("/api/agents/{agent_id}")
async def update_agent(agent_id: str, agent_data: Dict[str, Any]):
    """
    Update an agent's configuration.
    
    Request body:
        {
            "name": "Agent Name (optional)",
            "context": "Additional context (optional)",
            "temperature": 0.7 (optional)
        }
    """
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Don't allow editing running agents
    if agent.get("status") == "running":
        raise HTTPException(status_code=409, detail="Cannot edit running agent")
    
    try:
        # Update agent fields
        if "name" in agent_data:
            agent["name"] = agent_data["name"] or "Journalist"
        if "context" in agent_data:
            agent["context"] = agent_data["context"]
        if "temperature" in agent_data:
            agent["temperature"] = agent_data["temperature"]
        if "auto" in agent_data:
            agent["auto"] = agent_data["auto"]
        
        # Save to persistent store
        agent_manager._save_state()
        
        # Get serializable copy for broadcasting
        serializable_agent = agent_manager.get_serializable_agent(agent_id)
        
        # Broadcast agent update
        await broadcast_event({
            "type": "agent_updated",
            "data": serializable_agent
        })
        
        return agent
        
    except Exception as e:
        logger.error(f"Failed to update agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    import argparse
    import signal
    import sys
    
    parser = argparse.ArgumentParser(description="AI Journalist Agents Demo Server")
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
    
    # Print startup info after uvicorn starts
    def print_startup_info():
        import time
        time.sleep(1)  # Wait for uvicorn to fully start
        print()
        print("=" * 70)
        print("✅ Server is ready!")
        print()
        print(f"🌐 Open in browser: \x1b]8;;http://localhost:{args.port}\x1b\\http://localhost:{args.port}\x1b]8;;\x1b\\")
        print()
        print("=" * 70)
    
    import threading
    threading.Thread(target=print_startup_info, daemon=True).start()
    
    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        print("Cleanup complete.")
