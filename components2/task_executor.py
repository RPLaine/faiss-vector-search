"""
Task Executor

Executes individual tasks from the AI journalist workflow tasklist,
with LLM-based validation against expected outputs.
"""
import logging
import json
import asyncio
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from components.services import LLMService

logger = logging.getLogger(__name__)


class TaskExecutor:
    """
    Executes individual tasks with LLM service and validates outputs.
    
    Each task has:
    - id: Unique identifier within the tasklist
    - name: Task name (used as title)
    - description: Additional context for the task
    - expected_output: Description of what the output should contain
    """
    
    def __init__(
        self,
        llm_service: LLMService,
        executor: ThreadPoolExecutor,
        event_loop: asyncio.AbstractEventLoop
    ):
        """
        Initialize the task executor.
        
        Args:
            llm_service: LLM service instance for AI calls
            executor: Thread pool executor for LLM operations
            event_loop: Main event loop for coroutine scheduling
        """
        self.llm_service = llm_service
        self.executor = executor
        self.event_loop = event_loop
    
    async def execute_task(
        self,
        agent: Dict[str, Any],
        task: Dict[str, Any],
        task_callback: Optional[Callable] = None,
        chunk_callback: Optional[Callable] = None,
        validation_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute a single task from the agent's tasklist.
        
        Args:
            agent: Agent record dictionary
            task: Task dictionary with id, name, description, expected_output
            task_callback: Optional callback for task status updates
                Signature: async def callback(task_id: int, status: str, data: Optional[Dict])
            chunk_callback: Optional callback for streaming chunks
                Signature: def callback(task_id: int, chunk: str)
            validation_callback: Optional callback for validation results
                Signature: async def callback(task_id: int, is_valid: bool, reason: str)
                
        Returns:
            Result dictionary with output and validation status
            
        Raises:
            Exception: If task execution fails
        """
        task_id = task["id"]
        agent_id = agent["id"]
        
        # Check for cancellation
        if agent.get("cancelled", False):
            raise asyncio.CancelledError("Agent cancelled")
        
        logger.info(f"Agent {agent_id} - Executing task {task_id}: {task['name']}")
        
        # Notify task started
        if task_callback:
            await task_callback(task_id, "running", None)
        
        try:
            # Build prompt for task execution
            prompt = self._build_task_prompt(agent, task)
            
            # Collect chunks for streaming
            collected_chunks = []
            def stream_callback(chunk: str):
                collected_chunks.append(chunk)
                if chunk_callback:
                    chunk_callback(task_id, chunk)
            
            # Execute LLM call in thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.llm_service.call(
                    prompt=prompt,
                    temperature=agent["temperature"],
                    stream=True,
                    progress_callback=stream_callback
                )
            )
            
            task_output = response.text.strip()
            
            # Validate output against expected_output
            validation_result = await self._validate_output(
                agent,
                task,
                task_output,
                validation_callback
            )
            
            # Store result in task
            result = {
                "output": task_output,
                "validation": validation_result,
                "completed_at": datetime.now().isoformat()
            }
            
            # Notify task completed
            if task_callback:
                await task_callback(task_id, "completed", result)
            
            logger.info(f"Agent {agent_id} - Task {task_id} completed (valid: {validation_result['is_valid']})")
            
            return result
            
        except asyncio.CancelledError:
            logger.info(f"Agent {agent_id} - Task {task_id} cancelled")
            if task_callback:
                await task_callback(task_id, "cancelled", None)
            raise
            
        except Exception as e:
            logger.error(f"Agent {agent_id} - Task {task_id} failed: {e}")
            if task_callback:
                await task_callback(task_id, "failed", {"error": str(e)})
            raise
    
    def _build_task_prompt(self, agent: Dict[str, Any], task: Dict[str, Any]) -> str:
        """
        Build the LLM prompt for executing a task.
        
        Args:
            agent: Agent record
            task: Task dictionary
            
        Returns:
            Formatted prompt string
        """
        # Get agent context
        agent_name = agent.get("name", "Journalist")
        agent_context = agent.get("context", "")
        goal = agent.get("goal", "Complete the assigned task")
        
        # Build prompt
        prompt_parts = [
            f"You are {agent_name}, an AI journalist.",
            f"Overall Goal: {goal}",
            "",
            f"Current Task: {task['name']}",
            f"Description: {task['description']}",
            f"Expected Output: {task['expected_output']}",
        ]
        
        if agent_context:
            prompt_parts.insert(1, f"Additional Context: {agent_context}")
        
        prompt_parts.extend([
            "",
            "Please complete this task and provide the output as described.",
            "Be thorough and follow the expected output format.",
        ])
        
        return "\n".join(prompt_parts)
    
    async def _validate_output(
        self,
        agent: Dict[str, Any],
        task: Dict[str, Any],
        output: str,
        validation_callback: Optional[Callable]
    ) -> Dict[str, Any]:
        """
        Validate task output against expected output using LLM.
        
        Args:
            agent: Agent record
            task: Task dictionary
            output: The generated output
            validation_callback: Optional callback for validation results
            
        Returns:
            Validation result dictionary with is_valid, reason, score
        """
        task_id = task["id"]
        expected = task["expected_output"]
        
        # Build validation prompt
        validation_prompt = f"""You are a quality assurance reviewer. Your job is to determine if a task output meets the expected requirements.

Task Name: {task['name']}
Task Description: {task['description']}
Expected Output: {expected}

Actual Output:
{output}

Evaluate if the actual output meets the expected output requirements. Respond with a JSON object:
{{
    "is_valid": true/false,
    "score": 0-100,
    "reason": "brief explanation of why it passes or fails"
}}

Only respond with the JSON object, no additional text."""
        
        try:
            # Execute validation in thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.llm_service.call(
                    prompt=validation_prompt,
                    temperature=0.3,  # Lower temperature for more consistent validation
                    stream=False
                )
            )
            
            validation_text = response.text.strip()
            
            # Parse JSON response
            try:
                # Extract JSON from response
                extracted_json = validation_text
                
                if "```json" in extracted_json:
                    start = extracted_json.find("```json") + 7
                    end = extracted_json.find("```", start)
                    extracted_json = extracted_json[start:end].strip()
                elif "```" in extracted_json:
                    start = extracted_json.find("```") + 3
                    end = extracted_json.find("```", start)
                    extracted_json = extracted_json[start:end].strip()
                
                if not extracted_json.startswith("{"):
                    start_idx = extracted_json.find("{")
                    end_idx = extracted_json.rfind("}")
                    if start_idx != -1 and end_idx != -1:
                        extracted_json = extracted_json[start_idx:end_idx + 1]
                
                validation_result = json.loads(extracted_json)
                
                # Ensure required fields
                if "is_valid" not in validation_result:
                    validation_result["is_valid"] = False
                if "score" not in validation_result:
                    validation_result["score"] = 0
                if "reason" not in validation_result:
                    validation_result["reason"] = "Validation format error"
                
                # Notify validation result
                if validation_callback:
                    await validation_callback(
                        task_id,
                        validation_result["is_valid"],
                        validation_result["reason"]
                    )
                
                return validation_result
                
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(f"Failed to parse validation response: {e}")
                logger.error(f"Raw validation response: {validation_text[:500]}")
                
                # Default to invalid on parsing error
                result = {
                    "is_valid": False,
                    "score": 0,
                    "reason": f"Validation parsing error: {str(e)}"
                }
                
                if validation_callback:
                    await validation_callback(task_id, False, result["reason"])
                
                return result
                
        except Exception as e:
            logger.error(f"Validation failed for task {task_id}: {e}")
            
            # Default to invalid on error
            result = {
                "is_valid": False,
                "score": 0,
                "reason": f"Validation error: {str(e)}"
            }
            
            if validation_callback:
                await validation_callback(task_id, False, result["reason"])
            
            return result
