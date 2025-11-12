"""
Workflow Executor

Executes the multi-phase article writing workflow for AI journalist agents,
including subject generation, research phases, and article composition.
"""

import logging
import asyncio
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from components.services import LLMService

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
        
        try:
            # Phase 0: Invent Subject
            subject = await self._phase_invent_subject(
                agent, phase_callback, chunk_callback
            )
            
            # Phase 1-5: Research phases (simulated)
            await self._phase_get_sources(agent_id, phase_callback)
            await self._phase_extract_data(agent_id, phase_callback)
            await self._phase_find_names(agent_id, phase_callback)
            await self._phase_send_contacts(agent_id, phase_callback)
            await self._phase_receive_info(agent_id, phase_callback)
            
            # Phase 6: Write Article
            article = await self._phase_write_article(
                agent, subject, phase_callback, chunk_callback, action_callback
            )
            
            # Return results
            result = {
                "subject": subject,
                "article": article["text"],
                "word_count": len(article["text"].split()),
                "generation_time": article["generation_time"],
                "success": True
            }
            
            logger.info(f"Workflow completed for agent {agent_id}")
            return result
            
        except Exception as e:
            logger.error(f"Workflow failed for agent {agent_id}: {e}")
            raise
    
    async def _phase_invent_subject(
        self,
        agent: Dict[str, Any],
        phase_callback: Optional[Callable],
        chunk_callback: Optional[Callable]
    ) -> str:
        """Execute Phase 0: Invent Subject."""
        agent_id = agent["id"]
        
        if phase_callback:
            await phase_callback(
                0, "active", "Thinking of a compelling article subject..."
            )
        
        context_guidance = (
            f"\n\nAdditional context: {agent['context']}"
            if agent.get('context') else ""
        )
        
        subject_prompt = f"""You are a {agent['style']} journalist. Invent a compelling article subject/topic.{context_guidance}

Return ONLY the topic/headline, nothing else. Make it specific and newsworthy."""
        
        # Callback for streaming
        def stream_callback(chunk: str):
            """Forward chunks to phase callback."""
            if chunk_callback:
                chunk_callback(0, chunk)
        
        # Execute LLM call in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            self.executor,
            lambda: self.llm_service.call(
                prompt=subject_prompt,
                temperature=agent["temperature"],
                stream=True,
                progress_callback=stream_callback
            )
        )
        
        subject = response.text.strip()
        
        if phase_callback:
            await phase_callback(0, "completed", f"Subject: {subject}")
        
        logger.info(f"Agent {agent_id} generated subject: {subject}")
        return subject
    
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
