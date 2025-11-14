"""
Halt Manager

Centralized service for managing agent halt behavior.
Coordinates halt flag state, halt checking, and halt-related operations.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class HaltManager:
    """
    Manages halt behavior for AI journalist agents.
    
    Responsibilities:
    - Check if agent should halt
    - Enable/disable halt mode
    - Determine if agent can continue from halt
    - Coordinate halt state with workflow execution
    """
    
    def __init__(self, agent_manager: Any):
        """
        Initialize the halt manager.
        
        Args:
            agent_manager: Agent manager for accessing agent state
        """
        self.agent_manager = agent_manager
    
    def is_halt_enabled(self, agent_id: str) -> bool:
        """
        Check if halt mode is enabled for an agent.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if halt is enabled, False otherwise
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            logger.warning(f"Agent {agent_id} not found for halt check")
            return False
        
        return agent.get("halt", False)
    
    def should_halt_before_phase(self, agent_id: str, phase: int) -> bool:
        """
        Check if agent should halt before executing a phase.
        
        Args:
            agent_id: The agent ID
            phase: The phase number about to execute
            
        Returns:
            True if should halt, False otherwise
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            return False
        
        # Check if halt flag is set
        halt_enabled = agent.get("halt", False)
        
        if halt_enabled:
            logger.info(f"Agent {agent_id} should halt before phase {phase}")
            return True
        
        return False
    
    def should_halt_before_task(self, agent_id: str, task_id: int) -> bool:
        """
        Check if agent should halt before executing a task.
        
        Args:
            agent_id: The agent ID
            task_id: The task ID about to execute
            
        Returns:
            True if should halt, False otherwise
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            return False
        
        # Check if halt flag is set
        halt_enabled = agent.get("halt", False)
        
        if halt_enabled:
            logger.info(f"Agent {agent_id} should halt before task {task_id}")
            return True
        
        return False
    
    def should_halt_after_task(self, agent_id: str, task_id: int) -> bool:
        """
        Check if agent should halt after completing a task.
        
        Args:
            agent_id: The agent ID
            task_id: The task ID that just completed
            
        Returns:
            True if should halt, False otherwise
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            return False
        
        # Check if halt flag is set
        halt_enabled = agent.get("halt", False)
        
        if halt_enabled:
            logger.info(f"Agent {agent_id} should halt after task {task_id}")
            return True
        
        return False
    
    def set_halt(self, agent_id: str, enabled: bool) -> bool:
        """
        Enable or disable halt mode for an agent.
        
        Args:
            agent_id: The agent ID
            enabled: True to enable halt, False to disable
            
        Returns:
            True if successful, False if agent not found
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            logger.warning(f"Cannot set halt - agent {agent_id} not found")
            return False
        
        agent["halt"] = enabled
        self.agent_manager._save_state()
        
        logger.info(f"Agent {agent_id} halt set to: {enabled}")
        return True
    
    def clear_halt(self, agent_id: str) -> bool:
        """
        Clear halt flag to allow agent to continue.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if successful, False if agent not found
        """
        return self.set_halt(agent_id, False)
    
    def can_continue(self, agent_id: str) -> bool:
        """
        Check if agent can continue from halted state.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if agent can continue, False otherwise
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            return False
        
        status = agent.get("status")
        
        # Agent can continue if it's halted or stopped
        can_continue = status in ["halted", "stopped"]
        
        if not can_continue:
            logger.warning(
                f"Agent {agent_id} cannot continue - status is {status}, "
                f"expected 'halted' or 'stopped'"
            )
        
        return can_continue
    
    def mark_halted(
        self, 
        agent_id: str, 
        phase: Optional[int] = None,
        task_id: Optional[int] = None
    ) -> bool:
        """
        Mark agent as halted and save halt position.
        
        Args:
            agent_id: The agent ID
            phase: Current phase where halt occurred
            task_id: Current task ID where halt occurred (optional)
            
        Returns:
            True if successful, False if agent not found
        """
        agent = self.agent_manager.get_agent(agent_id)
        if not agent:
            logger.warning(f"Cannot mark halted - agent {agent_id} not found")
            return False
        
        # Update status and position
        self.agent_manager.update_agent_status(agent_id, "halted")
        
        if phase is not None:
            agent["current_phase"] = phase
        
        logger.info(
            f"Agent {agent_id} marked as halted at "
            f"phase {phase}{f', task {task_id}' if task_id else ''}"
        )
        
        return True
    
    def prepare_continue(self, agent_id: str) -> bool:
        """
        Prepare agent to continue from halted state.
        
        Args:
            agent_id: The agent ID
            
        Returns:
            True if successful, False if agent cannot continue
        """
        if not self.can_continue(agent_id):
            return False
        
        # Clear halt flag
        self.clear_halt(agent_id)
        
        # Update status to running
        self.agent_manager.update_agent_status(agent_id, "running")
        
        logger.info(f"Agent {agent_id} prepared to continue")
        return True
    
    def get_halt_result(
        self, 
        agent_id: str, 
        phase: int,
        task_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get standardized halt result dictionary.
        
        Args:
            agent_id: The agent ID
            phase: Phase where halt occurred
            task_id: Task ID where halt occurred (optional)
            
        Returns:
            Dictionary with halt result
        """
        result = {
            "halted": True,
            "phase": phase
        }
        
        if task_id is not None:
            result["task_id"] = task_id
        
        return result
