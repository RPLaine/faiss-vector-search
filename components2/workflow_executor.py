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
        event_loop: asyncio.AbstractEventLoop
    ):
        """
        Initialize the workflow executor.
        
        Args:
            llm_service: LLM service instance for AI calls
            executor: Thread pool executor for LLM operations
            event_loop: Main event loop for coroutine scheduling
        """
        self.llm_service = llm_service
        self.executor = executor
        self.event_loop = event_loop
        
        # Initialize task executor
        self.task_executor = TaskExecutor(llm_service, executor, event_loop)
        
        # Load prompts
        self.prompts_dir = Path("prompts2")
        self.hidden_context = self._load_prompt("hidden_context.txt")
        self.phase_0_prompt = self._load_prompt("phase_0_planning.txt")
    
    def _load_prompt(self, filename: str) -> str:
        """Load a prompt file from prompts2 directory."""
        try:
            prompt_path = self.prompts_dir / filename
            if prompt_path.exists():
                return prompt_path.read_text(encoding="utf-8")
            else:
                logger.warning(f"Prompt file not found: {filename}")
                return ""
        except Exception as e:
            logger.error(f"Failed to load prompt {filename}: {e}")
            return ""
    
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
            phase_callback: Optional callback for phase updates
                Signature: async def callback(phase: int, status: str, content: Optional[str])
            chunk_callback: Optional callback for streaming chunks
                Signature: def callback(phase: int, chunk: str)
            action_callback: Optional callback for action events
                Signature: def callback(action_data: Dict[str, Any])
                
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
            # Get the current phase (for resuming after halt)
            current_phase = agent.get("current_phase", -1)
            
            # Check if we're redoing a phase
            redo_phase = agent.get("redo_phase")
            if redo_phase is not None:
                # Set current_phase to one less so we re-execute the redo phase
                current_phase = redo_phase - 1
                # Clear the redo flag
                agent["redo_phase"] = None
                logger.info(f"Agent {agent_id} redoing phase {redo_phase}, current_phase set to {current_phase}")
            
            subject = agent.get("phase_0_response", "")
            tasklist = agent.get("tasklist")  # Get tasklist at top level
            
            # Phase 0: Invent Subject
            if current_phase < 0:
                result = await self._phase_invent_subject(
                    agent, phase_callback, chunk_callback
                )
                
                # Check if phase returned an error dict
                if isinstance(result, dict) and result.get("error"):
                    agent["current_phase"] = 0
                    logger.error(f"Agent {agent_id} tasklist validation failed: {result['error']}")
                    return {"halted": True, "phase": 0, "error": result["error"]}
                
                subject = result
                
                # Check halt dynamically before proceeding
                if agent.get("halt", False):
                    agent["current_phase"] = 0
                    logger.info(f"Agent {agent_id} halted at phase 0, returning halted status")
                    return {"halted": True, "phase": 0}
            
            # Execute tasks (either after phase 0 completes or when continuing from halt)
            # Task execution is part of phase 0
            if current_phase <= 0:
                # After phase 0, get updated tasklist and execute tasks
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
                        if chunk_callback:
                            # Reuse the existing chunk_callback but with task metadata
                            chunk_callback(-1, chunk)  # -1 indicates task phase
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
                        # Skip already completed/failed tasks
                        task_status = task.get("status", "created")
                        if task_status in ["completed", "failed", "cancelled"]:
                            logger.info(f"Agent {agent_id} - Skipping task {task['id']} (status: {task_status})")
                            continue
                        
                        # Check halt before each task
                        if agent.get("halt", False):
                            logger.info(f"Agent {agent_id} halted before task {task['id']}")
                            agent["current_phase"] = 0  # Still in phase 0 (tasks)
                            return {"halted": True, "phase": 0, "task_id": task["id"]}
                        
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
                                validation_callback=validation_callback
                            )
                            
                            # Store result back in the task object
                            task["status"] = "completed"
                            task["output"] = task_result.get("output", "")
                            task["validation"] = task_result.get("validation", {})
                            task["completed_at"] = task_result.get("completed_at", "")
                            
                            logger.info(f"Agent {agent_id} completed task {task['id']}: {task['name']}")
                            
                            # Check halt after task completes (before moving to next task)
                            if agent.get("halt", False):
                                logger.info(f"Agent {agent_id} halted after task {task['id']} completed")
                                agent["current_phase"] = 0  # Still in phase 0 (tasks)
                                return {"halted": True, "phase": 0, "task_id": task["id"]}
                            
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
            
            # Workflow is now complete after tasks
            # Phase 1-5: OLD RESEARCH PHASES - NOW REPLACED BY TASKS
            # Phase 6: OLD ARTICLE WRITING - NOW REPLACED BY FINAL TASK OUTPUT
            # The tasks themselves are the complete workflow
            
            # Clear current phase (workflow completed)
            agent["current_phase"] = -1
            
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
    
    async def _phase_invent_subject(
        self,
        agent: Dict[str, Any],
        phase_callback: Optional[Callable],
        chunk_callback: Optional[Callable]
    ) -> Union[str, Dict[str, Any]]:
        """Execute Phase 0: Generate Tasklist. Returns str on success, dict with error on failure."""
        agent_id = agent["id"]
        
        if phase_callback:
            await phase_callback(
                0, "active", "Creating tasklist based on agent profile..."
            )
        
        # Build prompt from template
        prompt = self.phase_0_prompt.format(
            agent_name=agent["name"],
            agent_context=agent.get("context", "No additional context provided"),
            agent_style=agent.get("style", "professional")
        )
        
        # Add hidden context
        full_prompt = f"{self.hidden_context}\n\n{prompt}"
        
        # Collect chunks and stream to UI
        collected_chunks = []
        def stream_callback(chunk: str):
            """Collect chunks and stream to UI."""
            collected_chunks.append(chunk)
            if chunk_callback:
                chunk_callback(0, chunk)
        
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
                    0, "completed",
                    tasklist_json  # Send raw response as content
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
                await phase_callback(0, "completed", f"ERROR: {str(e)}\n\n{tasklist_json}")  # Send error with raw response
            
            # Don't continue workflow, halt here
            return {"halted": True, "phase": 0, "error": str(e)}
    
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
        
        prompt = f"""You are a {agent['style']} writer. Write a complete article about: {subject}

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
                chunk_callback(6, chunk)
        
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
