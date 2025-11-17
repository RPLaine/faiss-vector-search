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
import requests

from components2.settings_manager import SettingsManager
from components2.llm_service import LLMService
from components2 import AgentManager, WorkflowExecutor
from components2.halt_manager import HaltManager

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
settings_manager: Optional[SettingsManager] = None
llm_service: Optional[LLMService] = None
agent_manager: Optional[AgentManager] = None
workflow_executor: Optional[WorkflowExecutor] = None
halt_manager: Optional[HaltManager] = None


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    global main_loop, settings_manager, llm_service, agent_manager, workflow_executor, halt_manager
    
    # Startup
    main_loop = asyncio.get_running_loop()
    logger.info("Initializing AI Journalist Demo system...")
    
    try:
        # Initialize settings manager
        settings_manager = SettingsManager("settings.json")
        
        # Initialize LLM service
        llm_service = LLMService(settings_manager.get_llm_config())
        
        # Initialize agent manager
        agent_manager = AgentManager()
        
        # Initialize halt manager
        halt_manager = HaltManager(agent_manager)
        
        # Initialize workflow executor (with settings_manager and agent_manager)
        workflow_executor = WorkflowExecutor(
            llm_service, executor, main_loop, agent_manager, settings_manager
        )
        
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
    if not agent_manager or not halt_manager:
        raise HTTPException(status_code=503, detail="Services not initialized")
    
    if not agent_manager.agent_exists(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.get("status") == "running":
        raise HTTPException(status_code=409, detail="Agent is already running")
    
    # Get halt setting from request and set via halt manager
    request_data = request_data or {}
    halt = request_data.get("halt", False)
    halt_manager.set_halt(agent_id, halt)
    
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
    """Continue a halted or stopped agent to the next phase."""
    if not halt_manager:
        raise HTTPException(status_code=503, detail="Halt manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Reject if already running (race condition protection)
    if agent.get("status") == "running":
        raise HTTPException(
            status_code=409,
            detail="Agent is already running"
        )
    
    # Check if agent can continue using halt manager
    if not halt_manager.can_continue(agent_id):
        raise HTTPException(
            status_code=409, 
            detail=f"Agent cannot continue - status is {agent.get('status')}"
        )
    
    # Prepare agent to continue (clears halt flag and updates status)
    success = halt_manager.prepare_continue(agent_id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to prepare agent for continuation")
    
    # Broadcast continue event
    await broadcast_event({
        "type": "agent_continued",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"],
            "phase": agent.get("current_phase", 0)
        }
    })
    
    # Resume the workflow
    loop = asyncio.get_event_loop()
    task = loop.create_task(run_agent(agent_id))
    agent_manager.set_agent_task(agent_id, task)
    
    return {"success": True, "agent_id": agent_id}


@app.post("/api/agents/{agent_id}/halt")
async def update_halt_state(agent_id: str, request_data: Dict[str, Any]):
    """Update the halt state of an agent (can be toggled during execution)."""
    if not halt_manager:
        raise HTTPException(status_code=503, detail="Halt manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update halt state via halt manager
    halt = request_data.get("halt", False)
    success = halt_manager.set_halt(agent_id, halt)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update halt state")
    
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


@app.post("/api/agents/{agent_id}/select")
async def select_agent(agent_id: str):
    """Set the selected agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    # Validate agent exists
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Update selected agent
    success = agent_manager.set_selected_agent_id(agent_id)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set selected agent")
    
    logger.info(f"Agent {agent_id} selected")
    
    return {"success": True, "agent_id": agent_id}


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
    
    # Save state to persist cancellation flag
    agent_manager._save_state()
    
    # Cancel the task
    task = agent.get("task")
    if task and not task.done():
        task.cancel()
        logger.info(f"Cancelled task for agent {agent_id}")
    
    # Update status to 'stopped' (indicates interrupted workflow with partial completion)
    agent_manager.update_agent_status(agent_id, "stopped")
    
    # Broadcast stop event with status
    await broadcast_event({
        "type": "agent_stopped",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"],
            "status": "stopped"
        }
    })
    
    return {"success": True, "agent_id": agent_id}


@app.post("/api/agents/{agent_id}/redo-tasklist")
async def redo_tasklist(agent_id: str):
    """Regenerate the tasklist for a halted, stopped, or completed agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Accept halted, stopped, completed, or failed statuses for redo
    if agent.get("status") not in ["halted", "stopped", "completed", "failed"]:
        raise HTTPException(status_code=409, detail="Agent must be halted, stopped, completed, or failed")
    
    # Clear tasklist and related data
    agent.pop("phase_0_response", None)
    agent.pop("tasklist", None)
    agent.pop("goal", None)
    
    # Set flag to regenerate tasklist
    agent["redo_tasklist"] = True
    
    # Save state to persist changes
    agent_manager._save_state()
    
    # Update status to running
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast redo event
    await broadcast_event({
        "type": "agent_redo",
        "data": {
            "agent_id": agent_id,
            "name": agent["name"],
            "redo_type": "tasklist"
        }
    })
    
    # Restart the workflow to regenerate tasklist
    asyncio.create_task(run_agent(agent_id))
    
    return {"success": True, "agent_id": agent_id, "redo_type": "tasklist"}


@app.post("/api/agents/{agent_id}/continue-from-failed")
async def continue_from_failed_task(agent_id: str):
    """Continue from the first failed or cancelled task."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Reject if already running (race condition protection)
    if agent.get("status") == "running":
        raise HTTPException(
            status_code=409,
            detail="Agent is already running"
        )
    
    # Accept halted, stopped, and failed statuses
    if agent.get("status") not in ["halted", "stopped", "failed"]:
        raise HTTPException(status_code=409, detail="Agent is not halted, stopped, or failed")
    
    # Find first failed or cancelled task
    tasklist = agent.get("tasklist", {})
    tasks = tasklist.get("tasks", [])
    
    failed_task = None
    for task in tasks:
        status = task.get("status")
        if status in ["failed", "cancelled"]:
            failed_task = task
            break
        # Also check for completed tasks with invalid validation
        validation = task.get("validation", {})
        if status == "completed" and not validation.get("is_valid", True):
            failed_task = task
            break
    
    if not failed_task:
        raise HTTPException(status_code=404, detail="No failed or cancelled task found")
    
    # Reset the failed/cancelled task
    failed_task["status"] = "created"
    failed_task["output"] = None
    failed_task["validation"] = None
    failed_task.pop("completed_at", None)
    
    # Mark that we're continuing from a specific task
    agent["redo_task_id"] = failed_task["id"]
    
    # Save state before restarting
    agent_manager._save_state()
    
    # Update status to running
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast task reset event
    await broadcast_event({
        "type": "task_reset",
        "data": {
            "agent_id": agent_id,
            "task_id": failed_task["id"]
        }
    })
    
    # Restart the workflow to execute the task
    asyncio.create_task(run_agent(agent_id))
    
    return {"success": True, "agent_id": agent_id, "task_id": failed_task["id"]}


@app.post("/api/agents/{agent_id}/redo-task")
async def redo_failed_task(agent_id: str):
    """Redo the first failed task for a halted or stopped agent."""
    if not agent_manager:
        raise HTTPException(status_code=503, detail="Agent manager not initialized")
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Accept 'halted', 'stopped', and 'failed' statuses for redo-task
    if agent.get("status") not in ["halted", "stopped", "failed"]:
        raise HTTPException(status_code=409, detail="Agent is not halted, stopped, or failed")
    
    # Find first failed task
    tasklist = agent.get("tasklist", {})
    tasks = tasklist.get("tasks", [])
    
    failed_task = None
    for task in tasks:
        validation = task.get("validation", {})
        if task.get("status") == "completed" and not validation.get("is_valid", True):
            failed_task = task
            break
        elif task.get("status") == "failed":
            failed_task = task
            break
    
    if not failed_task:
        raise HTTPException(status_code=404, detail="No failed task found")
    
    # Reset the failed task
    failed_task["status"] = "created"
    failed_task["output"] = None
    failed_task["validation"] = None
    failed_task.pop("completed_at", None)
    
    # Mark that we're redoing a specific task
    agent["redo_task_id"] = failed_task["id"]
    
    # Save state before restarting (task reset and redo_task_id need persistence)
    agent_manager._save_state()
    
    # Update status to running
    agent_manager.update_agent_status(agent_id, "running")
    
    # Broadcast task reset event
    await broadcast_event({
        "type": "task_reset",
        "data": {
            "agent_id": agent_id,
            "task_id": failed_task["id"]
        }
    })
    
    # Restart the workflow to execute the task
    asyncio.create_task(run_agent(agent_id))
    
    return {"success": True, "agent_id": agent_id, "task_id": failed_task["id"]}


async def run_agent(agent_id: str):
    """Run an AI journalist agent to write an article."""
    if not agent_manager or not workflow_executor:
        logger.error("Services not initialized")
        return
    
    agent = agent_manager.get_agent(agent_id)
    if not agent:
        return
    
    async def phase_callback(workflow_status: str, message: Optional[str] = None):
        """Callback for workflow status updates."""
        event_data = {
            "type": "workflow_status",
            "timestamp": datetime.now().isoformat(),
            "data": {"agent_id": agent_id, "status": workflow_status}
        }
        
        if message:
            event_data["data"]["message"] = message
        
        # Include tasklist when generation completes
        if workflow_status == "tasklist_generated" and agent.get("tasklist"):
            event_data["data"]["tasklist"] = agent["tasklist"]
        
        await broadcast_event(event_data)
        
        # Save to persistent store after tasklist generation
        if workflow_status == "tasklist_generated" and agent_manager:
            agent_manager._save_state()
    
    def chunk_callback(chunk: str):
        """Callback for streaming chunks."""
        if main_loop and active_connections:
            asyncio.run_coroutine_threadsafe(
                broadcast_event({
                    "type": "chunk",
                    "data": {
                        "agent_id": agent_id,
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
        
        # Save tool_call data immediately when tool completes (not just at task completion)
        if action_data.get("type") == "tool_call_complete":
            try:
                event_agent_id = action_data.get("agent_id") or agent_id
                task_id = action_data.get("data", {}).get("task_id")
                
                if event_agent_id and task_id:
                    agent_record = agent_manager.get_agent(event_agent_id)
                    if agent_record:
                        tasklist = agent_record.get("tasklist", {})
                        tasks = tasklist.get("tasks", [])
                        
                        # Find the task and store tool_call data
                        for task in tasks:
                            if task.get("id") == task_id:
                                # Build tool_call structure from event data
                                event_data = action_data.get("data", {})
                                task["tool_call"] = {
                                    "type": event_data.get("tool_type", "faiss_retrieval"),
                                    "query": event_data.get("query", ""),
                                    "documents": event_data.get("documents", []),
                                    "threshold_used": event_data.get("threshold_used"),
                                    "retrieval_time": event_data.get("retrieval_time", 0.0),
                                    "threshold_stats": event_data.get("threshold_stats", {})
                                }
                                
                                # Persist immediately
                                agent_manager._save_state()
                                logger.info(f"Saved tool_call data for agent {event_agent_id}, task {task_id}")
                                break
            except Exception as e:
                logger.error(f"Failed to save tool_call data: {e}")
    
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
            
            # Save state before restarting
            agent_manager._save_state()
            
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
        # Don't update status - already handled by stop endpoint (status set to "stopped")
        # Don't broadcast - already handled by stop endpoint
        
    except Exception as e:
        # Check if it's a cancellation exception
        if "cancelled" in str(e).lower() or agent.get("cancelled", False):
            logger.info(f"Agent {agent_id} was cancelled during LLM call")
            # Don't update status - already handled by stop endpoint (status set to "stopped")
            # Don't broadcast - already handled by stop endpoint
        # Check if it's an LLM API failure (timeout, connection error, etc.)
        elif isinstance(e, (TimeoutError, RuntimeError, requests.exceptions.RequestException)):
            logger.error(f"Agent {agent_id} LLM API error (auto-stopped): {e}")
            # Set status to 'stopped' so user can retry with Continue button
            agent_manager.update_agent_status(agent_id, "stopped")
            
            await broadcast_event({
                "type": "agent_stopped",
                "data": {
                    "agent_id": agent_id,
                    "name": agent["name"],
                    "status": "stopped",
                    "error": str(e)  # Include error message for UI display
                }
            })
        else:
            # Other failures (validation errors, logic errors, etc.) - mark as failed
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


# Settings API Endpoints

@app.get("/api/settings")
async def get_settings():
    """Get all settings (LLM config and prompts)."""
    if not settings_manager:
        raise HTTPException(status_code=503, detail="Settings manager not initialized")
    
    try:
        return settings_manager.get_all_settings()
    except Exception as e:
        logger.error(f"Failed to get settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/settings")
async def update_settings(settings_data: Dict[str, Any]):
    """
    Update settings (LLM config and/or prompts).
    
    Request body:
        {
            "llm": { ... } (optional),
            "prompts": { ... } (optional)
        }
    """
    if not settings_manager:
        raise HTTPException(status_code=503, detail="Settings manager not initialized")
    
    try:
        # Update LLM config if provided
        if "llm" in settings_data:
            settings_manager.update_llm_config(settings_data["llm"])
            # Update LLM service with new config
            if llm_service:
                llm_service.config = settings_manager.get_llm_config()
                logger.info("LLM service updated with new configuration")
        
        # Update prompts if provided
        if "prompts" in settings_data:
            settings_manager.update_prompts(settings_data["prompts"])
        
        # Update retrieval config if provided
        if "retrieval" in settings_data:
            settings_manager.update_retrieval_config(settings_data["retrieval"])
            logger.info("Retrieval configuration updated")
        
        # Broadcast settings update to all clients
        await broadcast_event({
            "type": "settings_updated",
            "data": settings_manager.get_all_settings()
        })
        
        return {"success": True, "settings": settings_manager.get_all_settings()}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/settings/reset")
async def reset_settings():
    """Reset all settings to defaults."""
    if not settings_manager:
        raise HTTPException(status_code=503, detail="Settings manager not initialized")
    
    try:
        settings_manager.reset_to_defaults()
        
        # Update LLM service with reset config
        if llm_service:
            llm_service.config = settings_manager.get_llm_config()
        
        # Broadcast settings reset
        await broadcast_event({
            "type": "settings_reset",
            "data": settings_manager.get_all_settings()
        })
        
        return {"success": True, "settings": settings_manager.get_all_settings()}
        
    except Exception as e:
        logger.error(f"Failed to reset settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Retrieval / Knowledge Base Management Endpoints

@app.get("/api/retrieval/stats")
async def get_retrieval_stats():
    """Get knowledge base statistics."""
    if not workflow_executor or not workflow_executor.faiss_retriever:
        return {
            "enabled": False,
            "available": False,
            "message": "FAISS retrieval not initialized"
        }
    
    try:
        stats = workflow_executor.faiss_retriever.get_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get retrieval stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/retrieval/index/build")
async def build_index_from_files(request: Dict[str, Any]):
    """
    Build FAISS index from text files.
    
    Request body:
    {
        "file_paths": ["path/to/file1.txt", "path/to/file2.txt"],  // optional, if empty scans data2/
        "doc_type": "knowledge"  // optional
    }
    """
    if not workflow_executor:
        raise HTTPException(status_code=503, detail="Workflow executor not initialized")
    
    try:
        # Initialize retriever on-demand if not already initialized
        if not workflow_executor.faiss_retriever:
            try:
                from components2.settings_manager import SettingsManager
                from components2.faiss_retriever import FaissRetriever
                
                settings_mgr = SettingsManager()
                retrieval_config = settings_mgr.get_retrieval_config()
                
                # Temporarily force enable retrieval for index building
                retrieval_config['enabled'] = True
                
                workflow_executor.faiss_retriever = FaissRetriever(retrieval_config)
                logger.info("FAISS retriever initialized for index building")
            except Exception as e:
                logger.error(f"Failed to initialize FAISS retriever: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to initialize retriever: {str(e)}")
        
        # If retriever exists but isn't available, try to re-initialize
        if not workflow_executor.faiss_retriever.is_available():
            logger.warning("FAISS retriever exists but is not available, attempting re-initialization")
            try:
                from components2.settings_manager import SettingsManager
                from components2.faiss_retriever import FaissRetriever
                
                settings_mgr = SettingsManager()
                retrieval_config = settings_mgr.get_retrieval_config()
                retrieval_config['enabled'] = True
                
                workflow_executor.faiss_retriever = FaissRetriever(retrieval_config)
                logger.info("FAISS retriever re-initialized successfully")
            except Exception as e:
                logger.error(f"Failed to re-initialize FAISS retriever: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to initialize retriever: {str(e)}")
        
        file_paths = request.get("file_paths", [])
        doc_type = request.get("doc_type", "knowledge")
        
        # If no file_paths provided, scan data2/ directory
        if not file_paths:
            data_dir = Path("data2")
            if data_dir.exists() and data_dir.is_dir():
                file_paths = [str(p) for p in data_dir.glob("*.txt")]
                logger.info(f"Scanning data2/ directory, found {len(file_paths)} .txt files")
            else:
                raise HTTPException(status_code=400, detail="data2/ directory not found and no file_paths provided")
        
        if not file_paths:
            raise HTTPException(status_code=400, detail="No .txt files found in data2/ directory")
        
        # Read file contents
        documents = []
        filenames = []
        for file_path in file_paths:
            path = Path(file_path)
            if not path.exists():
                logger.warning(f"File not found: {file_path}")
                continue
            
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        documents.append(content)
                        filenames.append(path.name)
            except Exception as e:
                logger.warning(f"Failed to read {file_path}: {e}")
                continue
        
        if not documents:
            raise HTTPException(status_code=400, detail="No valid documents found in provided paths")
        
        # Add documents to index
        success = workflow_executor.faiss_retriever.add_knowledge_documents(
            documents=documents,
            filenames=filenames,
            doc_type=doc_type
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add documents to index")
        
        stats = workflow_executor.faiss_retriever.get_stats()
        
        return {
            "success": True,
            "message": f"Successfully built index from {len(documents)} documents",
            "documents_added": len(documents),
            "stats": stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to build index: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/retrieval/index/add-text")
async def add_text_to_index(request: Dict[str, Any]):
    """
    Add text documents directly to the index.
    
    Request body:
    {
        "documents": [
            {"content": "text content", "filename": "doc1.txt"},
            {"content": "more text", "filename": "doc2.txt"}
        ],
        "doc_type": "knowledge"  // optional
    }
    """
    if not workflow_executor or not workflow_executor.faiss_retriever:
        raise HTTPException(status_code=503, detail="FAISS retrieval not initialized")
    
    try:
        doc_list = request.get("documents", [])
        doc_type = request.get("doc_type", "knowledge")
        
        if not doc_list:
            raise HTTPException(status_code=400, detail="No documents provided")
        
        documents = []
        filenames = []
        for doc in doc_list:
            content = doc.get("content", "").strip()
            filename = doc.get("filename", f"document_{len(documents)}.txt")
            if content:
                documents.append(content)
                filenames.append(filename)
        
        if not documents:
            raise HTTPException(status_code=400, detail="No valid documents provided")
        
        # Add documents to index
        success = workflow_executor.faiss_retriever.add_knowledge_documents(
            documents=documents,
            filenames=filenames,
            doc_type=doc_type
        )
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add documents to index")
        
        stats = workflow_executor.faiss_retriever.get_stats()
        
        return {
            "success": True,
            "documents_added": len(documents),
            "stats": stats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        selected_agent_id = agent_manager.get_selected_agent_id() if agent_manager else None
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "agents": agents,
                "selected_agent_id": selected_agent_id,
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
