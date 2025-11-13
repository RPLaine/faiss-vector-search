"""
Agent Manager

Handles agent lifecycle, state management, and operations for the
AI Journalist demo system.
"""

import logging
import uuid
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class AgentManager:
    """
    Manages AI journalist agents including creation, state tracking,
    and lifecycle operations.
    """
    
    def __init__(self, state_file: str = "agent_state.json"):
        """Initialize the agent manager."""
        self._agents: Dict[str, Dict[str, Any]] = {}
        self.state_file = Path(state_file)
        self._load_state()
    
    def _load_state(self):
        """Load agent state from file."""
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self._agents = data.get("agents", {})
                    
                # Reset running agents to created status and restore id field
                for agent_id, agent in self._agents.items():
                    agent["id"] = agent_id  # Restore id from dict key
                    if agent.get("status") == "running":
                        agent["status"] = "created"
                        agent.pop("task", None)  # Remove task reference
                        agent.pop("continue", None)
                        agent.pop("cancelled", None)
                    
                    # Fix task statuses based on validation results
                    tasklist = agent.get("tasklist", {})
                    tasks = tasklist.get("tasks", [])
                    for task in tasks:
                        validation = task.get("validation", {})
                        # If task is marked as completed but validation failed, set status to failed
                        if task.get("status") == "completed" and not validation.get("is_valid", True):
                            task["status"] = "failed"
                            logger.info(f"Corrected status for task {task.get('id')} in agent {agent_id} to 'failed' due to invalid validation")
                
                logger.info(f"Loaded {len(self._agents)} agents from state file")
            except Exception as e:
                logger.error(f"Failed to load agent state: {e}")
                self._agents = {}
        else:
            logger.info("No existing agent state file found")
    
    def _save_state(self):
        """Save agent state to file."""
        try:
            # Create a serializable copy (remove non-serializable objects and redundant id)
            serializable_agents = {}
            for agent_id, agent in self._agents.items():
                agent_copy = agent.copy()
                agent_copy.pop("task", None)  # Remove asyncio task
                agent_copy.pop("id", None)  # Remove redundant id (already in dict key)
                serializable_agents[agent_id] = agent_copy
            
            data = {
                "agents": serializable_agents,
                "last_updated": datetime.now().isoformat()
            }
            
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
            logger.debug(f"Saved {len(self._agents)} agents to state file")
        except Exception as e:
            logger.error(f"Failed to save agent state: {e}")
    
    def create_agent(
        self,
        name: Optional[str] = None,
        context: str = "",
        temperature: float = 0.7,
        auto: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new AI journalist agent.
        
        Args:
            name: Agent name (auto-generated if not provided)
            context: Additional context/guidance for the agent
            temperature: LLM temperature setting
            auto: Whether to auto-restart after completion
            
        Returns:
            Agent record dictionary
        """
        agent_id = str(uuid.uuid4())
        agent_name = name or "Journalist"
        
        agent = {
            "id": agent_id,
            "name": agent_name,
            "context": context,
            "temperature": temperature,
            "auto": auto,
            "status": "created",
            "created_at": datetime.now().isoformat()
        }
        
        self._agents[agent_id] = agent
        logger.info(f"Created agent: {agent_name} (ID: {agent_id})")
        
        self._save_state()
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
    
    def get_serializable_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a serializable copy of an agent (without task objects).
        
        Args:
            agent_id: The agent ID
            
        Returns:
            Serializable agent record or None if not found
        """
        agent = self._agents.get(agent_id)
        if agent:
            agent_copy = agent.copy()
            agent_copy.pop("task", None)
            return agent_copy
        return None
    
    def list_agents(self) -> List[Dict[str, Any]]:
        """
        List all agents.
        
        Returns:
            List of agent records (with non-serializable fields removed)
        """
        # Return serializable copies without task objects
        agents_list = []
        for agent in self._agents.values():
            agent_copy = agent.copy()
            agent_copy.pop("task", None)  # Remove asyncio task
            agents_list.append(agent_copy)
        return agents_list
    
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
        self._save_state()
        return agent
    
    def update_agent(
        self,
        agent_id: str,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        Update agent fields without changing status.
        
        Args:
            agent_id: The agent ID
            **kwargs: Fields to update
            
        Returns:
            Updated agent record or None if not found
        """
        agent = self._agents.get(agent_id)
        if not agent:
            logger.warning(f"Agent not found: {agent_id}")
            return None
        
        # Update fields
        for key, value in kwargs.items():
            agent[key] = value
        
        logger.info(f"Updated agent {agent_id} fields: {list(kwargs.keys())}")
        self._save_state()
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
        
        self._save_state()
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
            self._save_state()
        
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
