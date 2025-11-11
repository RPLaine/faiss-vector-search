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
from contextlib import asynccontextmanager
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

# Initialize RAG Controller
rag_controller = None

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Active query tracking
active_query_task = None
query_cancelled = False

# Store the main event loop
main_loop = None


def is_query_cancelled():
    """Check if the current query has been cancelled."""
    return query_cancelled


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    global rag_controller, main_loop
    
    # Startup
    main_loop = asyncio.get_running_loop()
    logger.info("Initializing RAG system...")
    
    # Progress callback for WebSocket broadcasting
    def progress_callback(progress_data: Dict[str, Any]):
        """Broadcast progress to all connected WebSockets."""
        if main_loop and active_connections:
            asyncio.run_coroutine_threadsafe(
                broadcast_progress(progress_data), 
                main_loop
            )
    
    try:
        rag_controller = RAGController(
            config_path="config.json",
            data_dir="data",
            progress_callback=progress_callback,
            cancellation_checker=is_query_cancelled
        )
        logger.info("RAG system initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize RAG system: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down RAG system...")
    executor.shutdown(wait=True)


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="RAG System API",
    description="REST API for FAISS-based Retrieval-Augmented Generation system",
    version="2.0.0",
    lifespan=lifespan
)


# Enable CORS for JavaScript frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

@app.get("/api")
async def api_info():
    """API information endpoint."""
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
    global active_query_task, query_cancelled
    
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    # Check if query is already running
    if active_query_task is not None:
        raise HTTPException(status_code=409, detail="A query is already in progress")
    
    try:
        # Reset cancellation flag
        query_cancelled = False
        
        # Create QueryRequest from dict
        request = QueryRequest(
            query=request_data.get("query", ""),
            use_context=request_data.get("use_context", True),
            template_name=request_data.get("template_name", "base"),
            optimize=request_data.get("optimize", False),
            improve=request_data.get("improve", False),
            mode=request_data.get("mode"),  # Extract mode field
            temperature=request_data.get("temperature"),
            top_k=request_data.get("top_k"),
            similarity_threshold=request_data.get("similarity_threshold"),
            hit_target=request_data.get("hit_target")
        )
        
        if not request.query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        # Execute query in thread pool to allow event loop to process WebSocket messages
        loop = asyncio.get_event_loop()
        active_query_task = loop.run_in_executor(
            executor,
            rag_controller.query,
            request
        )
        
        response = await active_query_task
        
        # Response is already a dictionary with all fields
        return response
        
    except asyncio.CancelledError:
        logger.info("Query was cancelled")
        raise HTTPException(status_code=499, detail="Query cancelled by user")
    except Exception as e:
        # Check if it's a QueryCancelledException
        from components.exceptions import QueryCancelledException
        if isinstance(e, QueryCancelledException):
            logger.info("Query was cancelled by user")
            raise HTTPException(status_code=499, detail="Query cancelled by user")
        elif isinstance(e, RuntimeError):
            raise HTTPException(status_code=409, detail=str(e))
        else:
            logger.error(f"Query execution failed: {e}")
            raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
    finally:
        active_query_task = None
        query_cancelled = False


@app.post("/api/query/cancel")
async def cancel_query():
    """
    Cancel the currently running query.
    
    Returns:
        {
            "success": true,
            "message": "Query cancelled"
        }
    """
    global active_query_task, query_cancelled
    
    if active_query_task is None:
        return {
            "success": False,
            "message": "No query is currently running"
        }
    
    try:
        # Set cancellation flag for the RAG system to check
        query_cancelled = True
        
        # Cancel the task
        if active_query_task and not active_query_task.done():
            active_query_task.cancel()
        
        logger.info("Query cancellation requested")
        
        # Broadcast cancellation to WebSocket clients
        await broadcast_progress({
            "type": "query_cancelled",
            "timestamp": datetime.now().isoformat(),
            "message": "Query processing cancelled by user"
        })
        
        return {
            "success": True,
            "message": "Query cancellation requested"
        }
        
    except Exception as e:
        logger.error(f"Failed to cancel query: {e}")
        return {
            "success": False,
            "message": f"Cancellation failed: {str(e)}"
        }


@app.get("/api/query/status")
async def get_query_status():
    """
    Get the status of the current query.
    
    Returns:
        {
            "is_running": true/false
        }
    """
    return {
        "is_running": active_query_task is not None
    }


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


@app.post("/api/documents/add")
async def add_documents(documents_data: Dict[str, Any]):
    """
    Add documents to the vector store.
    
    Request body:
        {
            "documents": [
                {
                    "filename": "example.txt",
                    "content": "Document content here..."
                },
                ...
            ]
        }
    """
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    try:
        documents_list = documents_data.get("documents", [])
        
        if not documents_list:
            raise HTTPException(status_code=400, detail="No documents provided")
        
        # Extract content from documents
        document_contents = [doc.get("content", "") for doc in documents_list]
        
        # Add documents in thread pool to allow WebSocket updates
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            rag_controller.add_documents,
            document_contents
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Adding documents failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add documents: {str(e)}")


@app.post("/api/vector-store/regenerate")
async def regenerate_vector_store():
    """
    Regenerate the vector store from files directory.
    
    This will:
    1. Clear the existing index
    2. Read all text files from the 'files' directory
    3. Rebuild the FAISS index
    """
    if rag_controller is None:
        raise HTTPException(status_code=503, detail="RAG system not initialized")
    
    try:
        # Regenerate in thread pool to allow WebSocket updates
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            rag_controller.regenerate_vector_store
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Vector store regeneration failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate: {str(e)}")


# Unprocessed Files Management

@app.get("/api/unprocessed/list")
async def list_unprocessed_files():
    """
    List all files in the unprocessed directory.
    
    Returns:
        {
            "files": [
                {
                    "filename": "document.docx",
                    "size": 12345,
                    "modified": "2025-11-07T10:30:00",
                    "extension": ".docx"
                },
                ...
            ],
            "total_count": 5,
            "total_size": 67890
        }
    """
    try:
        unprocessed_dir = Path("unprocessed")
        
        # Create directory if it doesn't exist
        unprocessed_dir.mkdir(exist_ok=True)
        
        files_info = []
        total_size = 0
        
        for file_path in unprocessed_dir.iterdir():
            if file_path.is_file():
                stat = file_path.stat()
                files_info.append({
                    "filename": file_path.name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "extension": file_path.suffix.lower()
                })
                total_size += stat.st_size
        
        # Sort by modified time, most recent first
        files_info.sort(key=lambda x: x["modified"], reverse=True)
        
        return {
            "files": files_info,
            "total_count": len(files_info),
            "total_size": total_size
        }
        
    except Exception as e:
        logger.error(f"Failed to list unprocessed files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")


@app.post("/api/unprocessed/upload")
async def upload_unprocessed_file(file_data: Dict[str, Any]):
    """
    Upload a file to the unprocessed directory.
    
    Request body:
        {
            "filename": "document.docx",
            "content": "base64_encoded_content"
        }
    """
    try:
        import base64
        
        filename = file_data.get("filename")
        content_b64 = file_data.get("content")
        
        if not filename or not content_b64:
            raise HTTPException(status_code=400, detail="Missing filename or content")
        
        # Sanitize filename
        safe_filename = Path(filename).name  # Remove any path components
        
        unprocessed_dir = Path("unprocessed")
        unprocessed_dir.mkdir(exist_ok=True)
        
        file_path = unprocessed_dir / safe_filename
        
        # Decode and write file
        content_bytes = base64.b64decode(content_b64)
        file_path.write_bytes(content_bytes)
        
        logger.info(f"File uploaded: {safe_filename} ({len(content_bytes)} bytes)")
        
        return {
            "success": True,
            "filename": safe_filename,
            "size": len(content_bytes),
            "path": str(file_path)
        }
        
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.delete("/api/unprocessed/{filename}")
async def delete_unprocessed_file(filename: str):
    """
    Delete a file from the unprocessed directory.
    """
    try:
        unprocessed_dir = Path("unprocessed")
        file_path = unprocessed_dir / filename
        
        # Security check: ensure file is within unprocessed directory
        if not file_path.resolve().parent == unprocessed_dir.resolve():
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path.unlink()
        logger.info(f"File deleted: {filename}")
        
        return {
            "success": True,
            "message": f"File '{filename}' deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File deletion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


@app.post("/api/unprocessed/process")
async def process_unprocessed_files():
    """
    Process all files in the unprocessed directory.
    Runs the preprocessing pipeline (convert DOCX → chunk → add to index).
    
    Returns:
        {
            "success": true,
            "files_processed": 5,
            "documents_added": 120,
            "message": "Processing complete"
        }
    """
    try:
        import subprocess
        
        # Run process_docx_files.py
        result = subprocess.run(
            ["python", "preprocessing/process_docx_files.py"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        if result.returncode != 0:
            logger.error(f"DOCX processing failed: {result.stderr}")
            raise HTTPException(
                status_code=500, 
                detail=f"DOCX processing failed: {result.stderr}"
            )
        
        # Run chunk_text_files.py
        result = subprocess.run(
            ["python", "preprocessing/chunk_text_files.py"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )
        
        if result.returncode != 0:
            logger.error(f"Text chunking failed: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Text chunking failed: {result.stderr}"
            )
        
        # Regenerate vector store in thread pool
        if rag_controller:
            loop = asyncio.get_event_loop()
            regen_result = await loop.run_in_executor(
                executor,
                rag_controller.regenerate_vector_store
            )
            
            return {
                "success": True,
                "message": "Processing complete",
                "documents_added": regen_result.get("documents_processed", 0)
            }
        else:
            return {
                "success": True,
                "message": "Files processed (vector store not initialized)"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


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
    import webbrowser
    import threading
    import argparse
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="RAG System Server")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't automatically open the browser"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind to (default: 8000)"
    )
    args = parser.parse_args()
    
    print("=" * 70)
    print("🚀 FAISS Vector Search Server")
    print("=" * 70)
    print(f"📡 Server starting on http://localhost:{args.port}")
    print(f"📁 Serving static files from: {public_dir}")
    print()
    print("Press Ctrl+C to stop the server")
    print("=" * 70)
    print()
    
    # Open browser after a short delay to ensure server is ready (unless --no-browser is set)
    if not args.no_browser:
        def open_browser():
            import time
            time.sleep(1.5)  # Wait for server to start
            webbrowser.open(f"http://localhost:{args.port}")
        
        threading.Thread(target=open_browser, daemon=True).start()
    else:
        print("ℹ️  Browser auto-open disabled (--no-browser flag)")
        print()
    
    uvicorn.run(app, host=args.host, port=args.port)
