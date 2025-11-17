"""
Task Executor

Executes individual tasks from the AI journalist workflow tasklist,
with LLM-based validation against expected outputs and optional FAISS retrieval.
"""
import logging
import json
import asyncio
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from components2.llm_service import LLMService
from components2.faiss_retriever import FaissRetriever

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
        event_loop: asyncio.AbstractEventLoop,
        settings_manager: Any = None,
        faiss_retriever: Optional[FaissRetriever] = None
    ):
        """
        Initialize the task executor.
        
        Args:
            llm_service: LLM service instance for AI calls
            executor: Thread pool executor for LLM operations
            event_loop: Main event loop for coroutine scheduling
            settings_manager: Settings manager for prompts and config
            faiss_retriever: Optional FAISS retriever for knowledge enhancement
        """
        self.llm_service = llm_service
        self.executor = executor
        self.event_loop = event_loop
        self.settings_manager = settings_manager
        self.faiss_retriever = faiss_retriever
    
    async def execute_task(
        self,
        agent: Dict[str, Any],
        task: Dict[str, Any],
        task_callback: Optional[Callable] = None,
        chunk_callback: Optional[Callable] = None,
        validation_callback: Optional[Callable] = None,
        action_callback: Optional[Callable] = None
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
            action_callback: Optional callback for tool/action events
                Signature: async def callback(event_data: Dict)
                
        Returns:
            Result dictionary with output, validation status, and optional tool_call
            
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
            # Perform knowledge retrieval if available
            retrieval_result = None
            if self.faiss_retriever and self.faiss_retriever.is_available():
                retrieval_result = await self._perform_retrieval(
                    agent, task, action_callback
                )
            
            # Build prompt for task execution (with optional retrieved context)
            prompt = self._build_task_prompt(agent, task, retrieval_result)
            
            print("\n" + "="*80)
            print(f"TASK EXECUTOR - Starting Task {task_id}")
            print("="*80)
            print(f"Agent ID: {agent_id}")
            print(f"Task Name: {task['name']}")
            print(f"Task Description: {task['description']}")
            print(f"Temperature: {agent['temperature']}")
            if retrieval_result and retrieval_result.get('documents'):
                print(f"Retrieved Documents: {len(retrieval_result['documents'])}")
            print(f"Prompt (first 300 chars): {prompt[:300]}...")
            print("="*80 + "\n")
            
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
            
            print("\n" + "="*80)
            print(f"TASK EXECUTOR - Task {task_id} Output Received")
            print("="*80)
            print(f"Output Length: {len(task_output)} characters")
            print(f"Output (first 300 chars): {task_output[:300]}...")
            print("="*80 + "\n")
            
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
            
            # Add retrieval context if it was used
            if retrieval_result:
                result["tool_call"] = {
                    "type": "faiss_retrieval",
                    "query": retrieval_result.get("query", ""),
                    "documents": retrieval_result.get("documents", []),
                    "threshold_used": retrieval_result.get("threshold_used"),
                    "retrieval_time": retrieval_result.get("retrieval_time", 0.0),
                    "threshold_stats": retrieval_result.get("threshold_stats", {})
                }
            
            # Notify task completed
            if task_callback:
                await task_callback(task_id, "completed", result)
            
            logger.info(f"Agent {agent_id} - Task {task_id} completed (valid: {validation_result['is_valid']})")
            
            return result
            
        except asyncio.CancelledError:
            print("\n" + "="*80)
            print(f"TASK EXECUTOR - Task {task_id} CANCELLED")
            print("="*80 + "\n")
            logger.info(f"Agent {agent_id} - Task {task_id} cancelled")
            if task_callback:
                await task_callback(task_id, "cancelled", None)
            raise
            
        except Exception as e:
            print("\n" + "="*80)
            print(f"TASK EXECUTOR - Task {task_id} FAILED")
            print("="*80)
            print(f"Error: {e}")
            print(f"Type: {type(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            print("="*80 + "\n")
            logger.error(f"Agent {agent_id} - Task {task_id} failed: {e}")
            if task_callback:
                await task_callback(task_id, "failed", {"error": str(e)})
            raise
    
    def _build_task_prompt(
        self,
        agent: Dict[str, Any],
        task: Dict[str, Any],
        retrieval_result: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Build the LLM prompt for executing a task.
        
        Args:
            agent: Agent record
            task: Task dictionary
            retrieval_result: Optional retrieval result with documents
            
        Returns:
            Formatted prompt string
        """
        # Get agent data
        agent_name = agent.get("name", "Journalist")
        agent_context = agent.get("context", "")
        goal = agent.get("goal", "Complete the assigned task")
        
        # Build context section
        context_parts = []
        if agent_context:
            context_parts.append(f"Additional Context: {agent_context}")
        
        # Add retrieved documents as context if available
        if retrieval_result and retrieval_result.get('documents'):
            context_parts.append("\n**Knowledge Base Context:**")
            for i, doc in enumerate(retrieval_result['documents'], 1):
                score = doc.get('score', 0.0)
                filename = doc.get('filename', 'unknown')
                content = doc.get('content', '')
                context_parts.append(
                    f"\n[Source {i}] {filename} (Relevance: {score:.2f})\n{content}"
                )
        
        context_str = "\n".join(context_parts) if context_parts else ""
        
        # Get prompt template from settings
        if self.settings_manager:
            template = self.settings_manager.get_prompt("task_execution")
            return template.format(
                agent_name=agent_name,
                goal=goal,
                task_name=task['name'],
                task_description=task['description'],
                expected_output=task['expected_output'],
                context=context_str
            )
        
        # Fallback if no settings manager
        prompt_parts = [
            f"You are {agent_name}, an AI journalist.",
            f"Overall Goal: {goal}",
            "",
            f"Current Task: {task['name']}",
            f"Description: {task['description']}",
            f"Expected Output: {task['expected_output']}",
        ]
        
        if context_str:
            prompt_parts.insert(2, context_str)
        
        prompt_parts.extend([
            "",
            "Please complete this task and provide the output as described.",
            "Be thorough and follow the expected output format.",
        ])
        
        return "\n".join(prompt_parts)
    
    async def _perform_retrieval(
        self,
        agent: Dict[str, Any],
        task: Dict[str, Any],
        action_callback: Optional[Callable] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Perform FAISS retrieval for task context enhancement.
        
        Args:
            agent: Agent record
            task: Task dictionary
            action_callback: Optional callback for tool events
            
        Returns:
            Retrieval result dictionary or None if retrieval fails
        """
        task_id = task["id"]
        agent_id = agent["id"]
        
        try:
            # Build query from task
            task_query = f"{task['name']}: {task['description']}"
            agent_context_str = f"{agent.get('name', '')} - {agent.get('goal', '')}"
            
            # Emit tool_call_start event
            if action_callback:
                await action_callback({
                    "type": "tool_call_start",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "agent_id": agent_id,
                        "task_id": task_id,
                        "tool_type": "faiss_retrieval",
                        "query": task_query
                    }
                })
            
            logger.info(f"Agent {agent_id} - Task {task_id}: Performing FAISS retrieval")
            
            # Perform retrieval in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            retrieval_result = await loop.run_in_executor(
                self.executor,
                lambda: self.faiss_retriever.retrieve_for_task(
                    task_query=task_query,
                    agent_context=agent_context_str,
                    action_callback=action_callback
                )
            )
            
            # Emit tool_call_complete event
            if action_callback:
                await action_callback({
                    "type": "tool_call_complete",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "agent_id": agent_id,
                        "task_id": task_id,
                        "tool_type": "faiss_retrieval",
                        "query": retrieval_result.get('query', task_query),
                        "num_documents": len(retrieval_result.get('documents', [])),
                        "threshold_used": retrieval_result.get('threshold_used'),
                        "retrieval_time": retrieval_result.get('retrieval_time', 0.0),
                        "documents": retrieval_result.get('documents', []),
                        "threshold_stats": retrieval_result.get('threshold_stats', {})
                    }
                })
            
            logger.info(
                f"Agent {agent_id} - Task {task_id}: "
                f"Retrieved {len(retrieval_result.get('documents', []))} documents"
            )
            
            return retrieval_result
            
        except Exception as e:
            logger.error(f"Agent {agent_id} - Task {task_id}: Retrieval failed: {e}")
            
            # Emit failure event
            if action_callback:
                await action_callback({
                    "type": "tool_call_failed",
                    "timestamp": datetime.now().isoformat(),
                    "data": {
                        "agent_id": agent_id,
                        "task_id": task_id,
                        "tool_type": "faiss_retrieval",
                        "error": str(e)
                    }
                })
            
            # Return None to continue without retrieval
            return None
    
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
        
        # Get validation prompt template from settings
        if self.settings_manager:
            validation_prompt = self.settings_manager.get_prompt("task_validation").format(
                task_name=task['name'],
                task_description=task['description'],
                expected_output=expected,
                actual_output=output
            )
        else:
            # Fallback if no settings manager
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
                        validation_result["reason"],
                        validation_result["score"]
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
                    await validation_callback(task_id, False, result["reason"], result["score"])
                
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
                await validation_callback(task_id, False, result["reason"], result["score"])
            
            return result
