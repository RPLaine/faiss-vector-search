"""
Workflow Executor

Executes the multi-phase article writing workflow for AI journalist agents,
including subject generation, research phases, and article composition.
"""

import logging
import asyncio
import json
from pathlib import Path
from typing import Dict, Any, Optional, Callable, Union
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from components2.llm_service import LLMService
from components2.task_executor import TaskExecutor
from components2.halt_manager import HaltManager
from components2.faiss_retriever import FaissRetriever

logger = logging.getLogger(__name__)


class WorkflowExecutor:
    """
    Executes the AI journalist workflow with multiple phases.
    
    Phases:
    0. Invent Subject - Generate article topic
    1. Get Sources - Search knowledge base
    2. Extract Data - Analyze documents
    3. Find Names - Identify sources
    4. Send Contacts - Contact sources
    5. Receive Info - Gather responses
    6. Write Article - Compose final article
    """
    
    def __init__(
        self,
        llm_service: LLMService,
        executor: ThreadPoolExecutor,
        event_loop: asyncio.AbstractEventLoop,
        agent_manager: Any = None,
        settings_manager: Any = None
    ):
        """
        Initialize the workflow executor.
        
        Args:
            llm_service: LLM service instance for AI calls
            executor: Thread pool executor for LLM operations
            event_loop: Main event loop for coroutine scheduling
            agent_manager: Agent manager for state persistence
            settings_manager: Settings manager for prompts and config
        """
        self.llm_service = llm_service
        self.executor = executor
        self.event_loop = event_loop
        self.agent_manager = agent_manager
        self.settings_manager = settings_manager
        
        # Initialize halt manager
        self.halt_manager = HaltManager(agent_manager) if agent_manager else None
        
        # Initialize FAISS retriever if enabled
        self.faiss_retriever = None
        if settings_manager:
            try:
                retrieval_config = settings_manager.get_retrieval_config()
                if retrieval_config.get('enabled', False):
                    self.faiss_retriever = FaissRetriever(retrieval_config)
                    logger.info("FAISS retriever initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize FAISS retriever: {e}")
        
        # Initialize task executor
        self.task_executor = TaskExecutor(
            llm_service, executor, event_loop, settings_manager, self.faiss_retriever
        )
    
    async def execute_workflow(
        self,
        agent: Dict[str, Any],
        phase_callback: Optional[Callable] = None,
        chunk_callback: Optional[Callable] = None,
        action_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute the complete journalist workflow for an agent.
        
        Args:
            agent: Agent record dictionary
            phase_callback: Optional callback for workflow status updates
                Signature: async def callback(status: str, message: Optional[str])
            chunk_callback: Optional callback for streaming chunks (agent-level content)
                Signature: def callback(chunk: str)
            action_callback: Optional callback for action events (task-level events)
                Signature: async def callback(action_data: Dict[str, Any])
                
        Returns:
            Result dictionary with article and metadata
            
        Raises:
            Exception: If workflow execution fails
        """
        agent_id = agent["id"]
        
        # Clear cancellation flag
        agent["cancelled"] = False
        
        # Set up cancellation checker for LLM service
        def check_cancelled():
            return agent.get("cancelled", False)
        
        self.llm_service.cancellation_checker = check_cancelled
        
        try:
            # Check if we need to regenerate tasklist
            redo_tasklist = agent.pop("redo_tasklist", None)
            
            subject = agent.get("phase_0_response", "")
            tasklist = agent.get("tasklist")
            
            # Generate tasklist if it doesn't exist or if regeneration requested
            if not tasklist or redo_tasklist:
                result = await self._generate_tasklist(
                    agent, phase_callback, chunk_callback
                )
                
                # Check if generation returned an error dict
                if isinstance(result, dict) and result.get("error"):
                    logger.error(f"Agent {agent_id} tasklist validation failed: {result['error']}")
                    return {"halted": True, "error": result["error"]}
                
                subject = result
                
                # Check halt dynamically before proceeding
                if self.halt_manager and self.halt_manager.should_halt_before_phase(agent_id, 0):
                    self.halt_manager.mark_halted(agent_id)
                    logger.info(f"Agent {agent_id} halted after tasklist generation")
                    return self.halt_manager.get_halt_result(agent_id)
                
                logger.info(f"Agent {agent_id} tasklist generation completed, proceeding to task execution")
            
            # Execute tasks (after tasklist generation or when continuing from halt)
            tasklist = agent.get("tasklist")
            if tasklist and tasklist.get("tasks"):
                # After tasklist generation, get updated tasklist and execute tasks
                tasklist = agent.get("tasklist")
                if tasklist and tasklist.get("tasks"):
                    logger.info(f"Agent {agent_id} executing {len(tasklist['tasks'])} tasks")
                    
                    # Execute tasks in order by ID
                    sorted_tasks = sorted(tasklist["tasks"], key=lambda t: t["id"])
                    
                    # Initialize task status if not set
                    for task in sorted_tasks:
                        if "status" not in task:
                            task["status"] = "created"
                    
                    # Create task callback wrapper
                    async def task_callback(task_id: int, status: str, data: Optional[Dict] = None):
                        # Update task status in the tasklist
                        for t in sorted_tasks:
                            if t["id"] == task_id:
                                t["status"] = status
                                # Save state when task status changes to running or completed
                                if status in ["running", "completed", "failed", "cancelled"] and self.agent_manager:
                                    self.agent_manager._save_state()
                                break
                        
                        if action_callback:
                            event = {
                                "type": f"task_{status}",
                                "timestamp": datetime.now().isoformat(),
                                "data": {
                                    "agent_id": agent_id,
                                    "task_id": task_id,
                                    "status": status
                                }
                            }
                            if data:
                                event["data"].update(data)
                            await action_callback(event)
                    
                    # Create task chunk callback wrapper
                    def task_chunk_callback(task_id: int, chunk: str):
                        # Only send task_chunk event - frontend routes to correct node
                        if action_callback:
                            # Schedule the coroutine in the main event loop
                            asyncio.run_coroutine_threadsafe(
                                action_callback({
                                    "type": "task_chunk",
                                    "data": {
                                        "agent_id": agent_id,
                                        "task_id": task_id,
                                        "chunk": chunk
                                    }
                                }),
                                self.event_loop
                            )
                    
                    # Create validation callback wrapper
                    async def validation_callback(task_id: int, is_valid: bool, reason: str, score: int = 0):
                        if action_callback:
                            await action_callback({
                                "type": "task_validation",
                                "timestamp": datetime.now().isoformat(),
                                "data": {
                                    "agent_id": agent_id,
                                    "task_id": task_id,
                                    "is_valid": is_valid,
                                    "reason": reason,
                                    "score": score
                                }
                            })
                    
                    for task in sorted_tasks:
                        # If redoing a specific task, skip others
                        redo_task_id = agent.get("redo_task_id")
                        if redo_task_id is not None:
                            if task["id"] != redo_task_id:
                                continue
                            # Clear the redo flag once we found the task
                            agent.pop("redo_task_id", None)
                        else:
                            # Skip already completed/failed tasks in normal flow
                            task_status = task.get("status", "created")
                            if task_status in ["completed", "failed", "cancelled"]:
                                logger.info(f"Agent {agent_id} - Skipping task {task['id']} (status: {task_status})")
                                continue
                        
                        # Check cancellation
                        if agent.get("cancelled", False):
                            raise asyncio.CancelledError("Agent cancelled during task execution")
                        
                        try:
                            # Execute task
                            task_result = await self.task_executor.execute_task(
                                agent=agent,
                                task=task,
                                task_callback=task_callback,
                                chunk_callback=task_chunk_callback,
                                validation_callback=validation_callback,
                                action_callback=action_callback
                            )
                            
                            # Store result back in the task object
                            # Set status to 'failed' if validation indicates failure
                            validation = task_result.get("validation", {})
                            if validation.get("is_valid", True):
                                task["status"] = "completed"
                            else:
                                task["status"] = "failed"
                            
                            task["output"] = task_result.get("output", "")
                            task["validation"] = validation
                            task["completed_at"] = task_result.get("completed_at", "")
                            
                            # Store tool_call if present (FAISS retrieval)
                            if "tool_call" in task_result:
                                task["tool_call"] = task_result["tool_call"]
                            
                            # Save state to persist task completion
                            if self.agent_manager:
                                self.agent_manager._save_state()
                            
                            logger.info(f"Agent {agent_id} completed task {task['id']}: {task['name']} (status: {task['status']})")
                            
                            # Check if this is the last task in the workflow
                            task_index = sorted_tasks.index(task)
                            is_last_task = (task_index == len(sorted_tasks) - 1)
                            
                            # Check halt after task completes (only if NOT the last task)
                            # If this is the last task, skip halting and allow normal completion
                            if not is_last_task and self.halt_manager and self.halt_manager.should_halt_after_task(agent_id, task["id"]):
                                self.halt_manager.mark_halted(agent_id, task_id=task["id"])
                                logger.info(f"Agent {agent_id} halted after task {task['id']} completed")
                                return self.halt_manager.get_halt_result(agent_id, task_id=task["id"])
                            elif is_last_task and self.halt_manager and agent.get("halt", False):
                                logger.info(f"Agent {agent_id} completed final task {task['id']} - proceeding to completion despite halt mode")
                            
                        except asyncio.CancelledError:
                            logger.info(f"Agent {agent_id} - Task {task['id']} cancelled")
                            task["status"] = "cancelled"
                            raise
                        except Exception as e:
                            logger.error(f"Agent {agent_id} - Task {task['id']} failed: {e}")
                            task["status"] = "failed"
                            task["error"] = str(e)
                            # Continue with next task even if one fails
                            if action_callback:
                                await action_callback({
                                    "type": "task_failed",
                                    "timestamp": datetime.now().isoformat(),
                                    "data": {
                                        "agent_id": agent_id,
                                        "task_id": task["id"],
                                        "error": str(e)
                                    }
                                })
                    
                    logger.info(f"Agent {agent_id} completed all tasks")
            
            # Workflow complete - tasks are the complete workflow
            # Get the goal from tasklist as the "subject"
            goal = agent.get("goal", subject if isinstance(subject, str) else "Task completion")
            
            # Collect task outputs as the final result
            task_results = []
            if tasklist and tasklist.get("tasks"):
                for task in tasklist["tasks"]:
                    task_results.append({
                        "task_id": task["id"],
                        "task_name": task["name"],
                        "output": task.get("output", "")
                    })
            
            # Return results
            result = {
                "subject": goal,
                "article": f"Tasks completed for: {goal}",  # Placeholder
                "task_results": task_results,
                "word_count": sum(len(str(t.get("output", "")).split()) for t in task_results),
                "generation_time": 0,
                "success": True
            }
            
            logger.info(f"Workflow completed for agent {agent_id}")
            return result
            
        except Exception as e:
            logger.error(f"Workflow failed for agent {agent_id}: {e}")
            raise
    
    async def _wait_for_continue(self, agent: Dict[str, Any]) -> bool:
        """
        Wait for user to click continue button.
        
        Returns:
            True if user clicked continue, False if cancelled/timeout
        """
        agent["continue"] = False
        
        # Wait up to 5 minutes for continue signal
        for _ in range(300):  # 300 seconds = 5 minutes
            if agent.get("continue"):
                agent["continue"] = False
                return True
            await asyncio.sleep(1)
        
        # Timeout
        logger.warning(f"Agent {agent['id']} halt timeout")
        return False
    
    async def _generate_tasklist(
        self,
        agent: Dict[str, Any],
        phase_callback: Optional[Callable],
        chunk_callback: Optional[Callable]
    ) -> Union[str, Dict[str, Any]]:
        """Generate tasklist for agent. Returns goal string on success, dict with error on failure."""
        agent_id = agent["id"]
        
        if phase_callback:
            await phase_callback(
                "tasklist_generating", "Creating tasklist based on agent profile..."
            )
        
        # Get prompts from settings manager
        hidden_context = self.settings_manager.get_prompt("hidden_context") if self.settings_manager else ""
        phase_0_template = self.settings_manager.get_prompt("phase_0_planning") if self.settings_manager else ""
        
        # Build prompt from template
        prompt = phase_0_template.format(
            agent_name=agent["name"],
            agent_context=agent.get("context", "No additional context provided")
        )
        
        # Add hidden context
        full_prompt = f"{hidden_context}\n\n{prompt}"
        
        # Collect chunks and stream to UI
        collected_chunks = []
        def stream_callback(chunk: str):
            """Collect chunks and stream to UI."""
            collected_chunks.append(chunk)
            if chunk_callback:
                chunk_callback(chunk)
        
        # Execute LLM call in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            self.executor,
            lambda: self.llm_service.call(
                prompt=full_prompt,
                temperature=agent["temperature"],
                stream=True,
                progress_callback=stream_callback
            )
        )
        
        tasklist_json = response.text.strip()
        
        # Parse JSON tasklist
        try:
            # Extract JSON - try multiple strategies
            extracted_json = tasklist_json
            
            # Strategy 1: Remove markdown code blocks
            if "```json" in extracted_json:
                start = extracted_json.find("```json") + 7
                end = extracted_json.find("```", start)
                extracted_json = extracted_json[start:end].strip()
            elif "```" in extracted_json:
                start = extracted_json.find("```") + 3
                end = extracted_json.find("```", start)
                extracted_json = extracted_json[start:end].strip()
            
            # Strategy 2: Find JSON object boundaries
            if not extracted_json.startswith("{"):
                # Look for the first { and last }
                start_idx = extracted_json.find("{")
                end_idx = extracted_json.rfind("}")
                if start_idx != -1 and end_idx != -1:
                    extracted_json = extracted_json[start_idx:end_idx + 1]
            
            tasklist = json.loads(extracted_json)
            
            # Validate tasklist structure
            if not isinstance(tasklist, dict):
                raise ValueError("Tasklist must be a JSON object")
            
            if "goal" not in tasklist:
                raise ValueError("Tasklist must contain 'goal' field")
            
            if "tasks" not in tasklist:
                raise ValueError("Tasklist must contain 'tasks' field")
            
            if not isinstance(tasklist["tasks"], list):
                raise ValueError("'tasks' must be an array")
            
            # Validate each task has required fields
            for i, task in enumerate(tasklist["tasks"]):
                if not isinstance(task, dict):
                    raise ValueError(f"Task {i} must be an object")
                
                required_fields = ["id", "name", "description", "expected_output"]
                missing_fields = [f for f in required_fields if f not in task]
                if missing_fields:
                    raise ValueError(f"Task {i} missing required fields: {', '.join(missing_fields)}")
            
            # Store raw response and parsed tasklist in agent state
            agent["phase_0_response"] = tasklist_json
            agent["tasklist"] = tasklist
            agent["goal"] = tasklist.get("goal", "Complete assigned tasks")
            
            if phase_callback:
                await phase_callback(
                    "tasklist_generated",
                    tasklist_json  # Send raw response as message
                )
            
            logger.info(f"Agent {agent_id} generated tasklist: {tasklist.get('goal')}")
            return tasklist.get("goal", "Task planning complete")
            
        except (json.JSONDecodeError, ValueError) as e:
            error_type = "JSON parsing" if isinstance(e, json.JSONDecodeError) else "validation"
            logger.error(f"Failed {error_type} for agent {agent_id}: {e}")
            logger.error(f"Raw response: {tasklist_json[:500]}...")  # Log first 500 chars
            
            # Set agent status to tasklist_error
            agent["status"] = "tasklist_error"
            
            # Fallback: store raw text with error info
            agent["phase_0_response"] = tasklist_json
            agent["tasklist"] = {
                "goal": "Task planning", 
                "tasks": [], 
                "raw": tasklist_json,
                "error": str(e)
            }
            
            if phase_callback:
                await phase_callback("error", f"ERROR: {str(e)}\n\n{tasklist_json}")
            
            # Don't continue workflow, halt here
            return {"halted": True, "error": str(e)}
    
    async def _phase_get_sources(
        self,
        agent_id: str,
        phase_callback: Optional[Callable]
    ):
        """Execute Phase 1: Get Sources (simulated)."""
        if phase_callback:
            await phase_callback(
                1, "active", "Searching knowledge base for relevant documents..."
            )
        
        await asyncio.sleep(1.0)
        
        if phase_callback:
            await phase_callback(1, "completed", "Found 5 relevant source documents")
        
        logger.debug(f"Agent {agent_id} - Phase 1 completed")
    
    async def _phase_extract_data(
        self,
        agent_id: str,
        phase_callback: Optional[Callable]
    ):
        """Execute Phase 2: Extract Data (simulated)."""
        if phase_callback:
            await phase_callback(
                2, "active", "Analyzing documents and extracting key information..."
            )
        
        await asyncio.sleep(1.0)
        
        if phase_callback:
            await phase_callback(
                2, "completed", "Extracted key facts, statistics, and quotes"
            )
        
        logger.debug(f"Agent {agent_id} - Phase 2 completed")
    
    async def _phase_find_names(
        self,
        agent_id: str,
        phase_callback: Optional[Callable]
    ):
        """Execute Phase 3: Find Names (simulated)."""
        if phase_callback:
            await phase_callback(
                3, "active", "Identifying relevant people and organizations..."
            )
        
        await asyncio.sleep(1.0)
        
        if phase_callback:
            await phase_callback(
                3, "completed", "Identified 3 expert sources and 2 organizations"
            )
        
        logger.debug(f"Agent {agent_id} - Phase 3 completed")
    
    async def _phase_send_contacts(
        self,
        agent_id: str,
        phase_callback: Optional[Callable]
    ):
        """Execute Phase 4: Send Contacts (simulated)."""
        if phase_callback:
            await phase_callback(
                4, "active", "Sending emails and making phone calls to sources..."
            )
        
        await asyncio.sleep(1.0)
        
        if phase_callback:
            await phase_callback(4, "completed", "Contacted 5 sources successfully")
        
        logger.debug(f"Agent {agent_id} - Phase 4 completed")
    
    async def _phase_receive_info(
        self,
        agent_id: str,
        phase_callback: Optional[Callable]
    ):
        """Execute Phase 5: Receive Info (simulated)."""
        if phase_callback:
            await phase_callback(
                5, "active",
                "Waiting for source responses and gathering additional info..."
            )
        
        await asyncio.sleep(1.5)
        
        if phase_callback:
            await phase_callback(
                5, "completed", "Received 4 responses with quotes and insights"
            )
        
        logger.debug(f"Agent {agent_id} - Phase 5 completed")
    
    async def _phase_write_article(
        self,
        agent: Dict[str, Any],
        subject: str,
        phase_callback: Optional[Callable],
        chunk_callback: Optional[Callable],
        action_callback: Optional[Callable]
    ) -> Dict[str, Any]:
        """Execute Phase 6: Write Article."""
        agent_id = agent["id"]
        
        if phase_callback:
            await phase_callback(
                6, "active", "Composing article with markdown formatting..."
            )
        
        prompt = f"""You are {agent['name']}, a journalist. Write a complete article about: {subject}

Structure your article with:
- A compelling headline
- An engaging opening paragraph
- 2-3 main body paragraphs with details
- A strong conclusion

Keep it concise (300-500 words) and engaging. Use markdown formatting for better readability."""
        
        # Callback for streaming chunks
        def stream_callback(chunk: str):
            """Forward chunks to article callback."""
            if chunk_callback:
                chunk_callback(chunk)
        
        # Callback for action events
        def action_event_callback(action_data: Dict[str, Any]):
            """Forward action events."""
            if action_callback:
                action_callback(action_data)
        
        # Execute LLM call in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            self.executor,
            lambda: self.llm_service.call(
                prompt=prompt,
                temperature=agent["temperature"],
                stream=True,
                progress_callback=stream_callback,
                action_callback=action_event_callback
            )
        )
        
        if phase_callback:
            await phase_callback(6, "completed")
        
        logger.info(f"Agent {agent_id} completed article ({len(response.text.split())} words)")
        
        return {
            "text": response.text,
            "generation_time": response.generation_time
        }
