"""
FastAPI Server for RAG System

Provides REST API, WebSocket endpoints, and serves the web UI.

Usage:
    python server.py
    
    Or with uvicorn directly:
    uvicorn server:app --reload --host 0.0.0.0 --port 8000
"""

import logging
from pathlib import Path
from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Dict, Any, List
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from components.api import RAGController
from components.api.api_models import QueryRequest, ConfigUpdate

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Thread pool for running synchronous RAG operations
executor = ThreadPoolExecutor(max_workers=4)

# Initialize FastAPI app
app = FastAPI(
    title="RAG System API",
    description="REST API for FAISS-based Retrieval-Augmented Generation system",
    version="2.0.0"
)

# Enable CORS for JavaScript frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAG Controller
rag_controller = None

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Store the main event loop
main_loop = None


@app.on_event("startup")
async def startup_event():
    """Initialize RAG controller on startup."""
    global rag_controller, main_loop
    
    # Store the main event loop for thread-safe broadcasting
    main_loop = asyncio.get_running_loop()
    
    logger.info("Initializing RAG system...")
    
    # Progress callback for WebSocket broadcasting
    def progress_callback(progress_data: Dict[str, Any]):
        """Broadcast progress to all connected WebSockets."""
        # Schedule broadcast in main event loop from worker thread
        if main_loop and active_connections:
            asyncio.run_coroutine_threadsafe(
                broadcast_progress(progress_data), 
                main_loop
            )
    
    try:
        rag_controller = RAGController(
            config_path="config.json",
            data_dir="data",
            progress_callback=progress_callback
        )
        logger.info("RAG system initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize RAG system: {e}")
        raise


async def broadcast_progress(data: Dict[str, Any]):
    """Broadcast progress update to all WebSocket clients."""
    if not active_connections:
        return
        
    logger.info(f"Broadcasting to {len(active_connections)} clients: {data.get('type', 'unknown')}")
    
    for connection in active_connections:
        try:
            await connection.send_json(data)
            logger.debug(f"Sent progress update: {data.get('type')}")
        except Exception as e:
            logger.warning(f"Failed to send progress update: {e}")


# Health & Status Endpoints

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "RAG System API",
        "version": "2.0.0",
        "status": "operational",
        "endpoints": {
            "health": "/health",
            "status": "/api/status",
            "query": "/api/query",
            "config": "/api/config",
            "documents": "/api/documents/search"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    return rag_controller.health_check()


@app.get("/api/status")
async def get_status():
    """Get current system status."""
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    status = rag_controller.get_status()
    return status.to_dict()


@app.get("/api/statistics")
async def get_statistics():
    """Get detailed system statistics."""
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    return rag_controller.get_statistics()


# Query Endpoints

@app.post("/api/query")
async def execute_query(request_data: Dict[str, Any]):
    """
    Execute RAG query.
    
    Request body:
        {
            "query": "Your question here",
            "use_context": true,
            "template_name": "base",
            "optimize": false,
            "improve": false,
            "temperature": 0.7,  // optional
            "top_k": 10  // optional
        }
    """
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    try:
        # Create QueryRequest from dict
        request = QueryRequest(
            query=request_data.get("query", ""),
            use_context=request_data.get("use_context", True),
            template_name=request_data.get("template_name", "base"),
            optimize=request_data.get("optimize", False),
            improve=request_data.get("improve", False),
            temperature=request_data.get("temperature"),
            top_k=request_data.get("top_k"),
            similarity_threshold=request_data.get("similarity_threshold")
        )
        
        if not request.query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        # Execute query in thread pool to allow event loop to process WebSocket messages
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            executor,
            rag_controller.query,
            request
        )
        
        # Response is already a dictionary with all fields
        return response
        
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/api/documents/search")
async def search_documents(search_data: Dict[str, Any]):
    """
    Search documents without generating response.
    
    Request body:
        {
            "query": "Search query",
            "top_k": 10
        }
    """
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    try:
        query = search_data.get("query", "")
        top_k = search_data.get("top_k", 10)
        
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        documents = rag_controller.search_documents(query, top_k)
        
        return {
            "query": query,
            "documents": documents,
            "count": len(documents)
        }
        
    except Exception as e:
        logger.error(f"Document search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


# Configuration Endpoints

@app.get("/api/config")
async def get_config():
    """Get current configuration."""
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    return rag_controller.get_config()


@app.put("/api/config")
async def update_config(config_data: Dict[str, Any]):
    """
    Update configuration.
    
    Request body:
        {
            "temperature": 0.7,
            "top_k": 10,
            "similarity_threshold": 0.55,
            "optimization_enabled": true,
            "improvement_enabled": false
        }
    """
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    try:
        update = ConfigUpdate(
            temperature=config_data.get("temperature"),
            top_k=config_data.get("top_k"),
            similarity_threshold=config_data.get("similarity_threshold"),
            hit_target=config_data.get("hit_target"),
            optimization_enabled=config_data.get("optimization_enabled"),
            improvement_enabled=config_data.get("improvement_enabled")
        )
        
        status = rag_controller.update_config(update)
        
        return {
            "message": "Configuration updated successfully",
            "status": status.to_dict()
        }
        
    except Exception as e:
        logger.error(f"Configuration update failed: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")


# WebSocket Endpoint for Real-time Updates

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time progress updates.
    
    Connect to: ws://localhost:8000/ws
    """
    await websocket.accept()
    active_connections.append(websocket)
    
    logger.info(f"WebSocket client connected. Total connections: {len(active_connections)}")
    
    try:
        # Send initial status
        if rag_controller:
            status = rag_controller.get_status()
            await websocket.send_json({
                "type": "connection_established",
                "status": status.to_dict(),
                "timestamp": datetime.now().isoformat()
            })
        
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            # Echo back for ping/pong
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


# Mount static files for web UI (must be last)
public_dir = Path(__file__).parent / "public"
if public_dir.exists():
    app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")
    logger.info(f"Serving static files from: {public_dir}")
else:
    logger.warning(f"Public directory not found: {public_dir}")


if __name__ == "__main__":
    import uvicorn
    
    print("=" * 70)
    print("🚀 RAG System Server")
    print("=" * 70)
    print(f"📡 Server starting on http://localhost:8000")
    print(f"📁 Serving static files from: {public_dir}")
    print()
    print("📝 Available endpoints:")
    print("   • http://localhost:8000/          → Web UI")
    print("   • http://localhost:8000/docs      → API Documentation")
    print("   • http://localhost:8000/api/      → REST API")
    print("   • ws://localhost:8000/ws          → WebSocket")
    print()
    print("Press Ctrl+C to stop the server")
    print("=" * 70)
    print()
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
