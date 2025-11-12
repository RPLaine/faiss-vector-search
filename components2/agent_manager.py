"""
Agent Manager

Handles agent lifecycle, state management, and operations for the
AI Journalist demo system.
"""

import logging
import uuid
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class AgentManager:
    """
    Manages AI journalist agents including creation, state tracking,
    and lifecycle operations.
    """
    
    def __init__(self):
        """Initialize the agent manager."""
        self._agents: Dict[str, Dict[str, Any]] = {}
    
    def create_agent(
        self,
        name: Optional[str] = None,
        context: str = "",
        style: str = "professional journalism",
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        Create a new AI journalist agent.
        
        Args:
            name: Agent name (auto-generated if not provided)
            context: Additional context/guidance for the agent
            style: Writing style preference
            temperature: LLM temperature setting
            
        Returns:
            Agent record dictionary
        """
        agent_id = str(uuid.uuid4())
        agent_name = name or f"Agent {len(self._agents) + 1}"
        
        agent = {
            "id": agent_id,
            "name": agent_name,
            "context": context,
            "style": style,
            "temperature": temperature,
            "status": "created",
            "created_at": datetime.now().isoformat()
        }
        
        self._agents[agent_id] = agent
        logger.info(f"Created agent: {agent_name} (ID: {agent_id})")
        
        return agent
    
    def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get an agent by ID.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            Agent record or None if not found
        """
        return self._agents.get(agent_id)
    
    def list_agents(self) -> List[Dict[str, Any]]:
        """
        List all agents.
        
        Returns:
            List of agent records
        """
        return list(self._agents.values())
    
    def update_agent_status(
        self,
        agent_id: str,
        status: str,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        Update agent status and optionally other fields.
        
        Args:
            agent_id: The agent ID
            status: New status value
            **kwargs: Additional fields to update
            
        Returns:
            Updated agent record or None if not found
        """
        agent = self._agents.get(agent_id)
        if not agent:
            logger.warning(f"Agent not found: {agent_id}")
            return None
        
        agent["status"] = status
        
        # Update status-specific timestamps
        if status == "running" and "started_at" not in kwargs:
            agent["started_at"] = datetime.now().isoformat()
        elif status == "completed" and "completed_at" not in kwargs:
            agent["completed_at"] = datetime.now().isoformat()
        
        # Update additional fields
        for key, value in kwargs.items():
            agent[key] = value
        
        logger.info(f"Updated agent {agent_id} status to: {status}")
        return agent
    
    def set_agent_task(self, agent_id: str, task: asyncio.Task) -> bool:
        """
        Store an asyncio task reference for an agent.
        
        Args:
            agent_id: The agent ID
            task: The asyncio task
            
        Returns:
            True if successful, False if agent not found
        """
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        
        agent["task"] = task
        return True
    
    def delete_agent(self, agent_id: str) -> bool:
        """
        Delete an agent.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if deleted, False if not found
        """
        agent = self._agents.get(agent_id)
        if not agent:
            logger.warning(f"Cannot delete - agent not found: {agent_id}")
            return False
        
        # Cancel task if running
        if "task" in agent and not agent["task"].done():
            agent["task"].cancel()
            logger.info(f"Cancelled task for agent: {agent_id}")
        
        del self._agents[agent_id]
        logger.info(f"Deleted agent: {agent_id}")
        return True
    
    def clear_completed_agents(self) -> int:
        """
        Remove all completed or failed agents.
        
        Returns:
            Number of agents cleared
        """
        cleared = []
        
        for agent_id, agent in list(self._agents.items()):
            if agent["status"] in ["completed", "failed"]:
                del self._agents[agent_id]
                cleared.append(agent_id)
        
        count = len(cleared)
        if count > 0:
            logger.info(f"Cleared {count} completed/failed agents")
        
        return count
    
    def get_agent_count(self) -> int:
        """
        Get the total number of agents.
        
        Returns:
            Number of agents
        """
        return len(self._agents)
    
    def agent_exists(self, agent_id: str) -> bool:
        """
        Check if an agent exists.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if agent exists, False otherwise
        """
        return agent_id in self._agents
