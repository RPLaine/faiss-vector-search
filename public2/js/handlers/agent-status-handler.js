/**
 * Agent Status Handler
 * 
 * Centralized agent status management and coordination.
 * 
 * Responsibilities:
 * - Handle agent status transitions
 * - Validate status changes
 * - Coordinate status updates across managers and renderers
 * - Emit status-related events
 * 
 * This handler acts as the single source of truth for agent status changes.
 */

import { 
    AGENT_STATUS, 
    AGENT_STATUS_DISPLAY, 
    AGENT_STATUS_CLASSES,
    AgentStatusPredicates,
    isValidAgentStatus
} from '../constants/status-constants.js';

export class AgentStatusHandler {
    constructor(agentManager, agentRenderer, controlPanelManager) {
        this.agentManager = agentManager;
        this.agentRenderer = agentRenderer;
        this.controlPanelManager = controlPanelManager;
    }
    
    /**
     * Update agent status with validation and coordination
     * 
     * @param {string} agentId - Agent ID
     * @param {string} newStatus - New status value
     * @param {Object} metadata - Optional metadata (hasFailedTasks, etc.)
     */
    updateStatus(agentId, newStatus, metadata = {}) {
        // Validate status
        if (!isValidAgentStatus(newStatus)) {
            console.error(`[AgentStatusHandler] Invalid status: ${newStatus}`);
            return false;
        }
        
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            console.warn(`[AgentStatusHandler] Agent not found: ${agentId}`);
            return false;
        }
        
        const oldStatus = agent.status;
        
        // Validate transition
        if (!this._isValidTransition(oldStatus, newStatus)) {
            console.warn(`[AgentStatusHandler] Invalid transition: ${oldStatus} → ${newStatus}`);
            // Allow it anyway for now (backend is authoritative)
        }
        
        console.log(`[AgentStatusHandler] ${agentId}: ${oldStatus} → ${newStatus}`);
        
        // Update state
        this.agentManager.updateAgentStatus(agentId, newStatus);
        
        // Update UI
        this.agentRenderer.updateStatus(agentId, newStatus);
        
        // Update control panel if this is the selected agent
        const agentWithMetadata = {
            ...agent,
            status: newStatus,
            ...metadata
        };
        this.controlPanelManager.updateStatus(agentId, newStatus, agentWithMetadata);
        
        return true;
    }
    
    /**
     * Validate status transition
     * 
     * @param {string} oldStatus - Current status
     * @param {string} newStatus - New status
     * @returns {boolean} True if transition is valid
     */
    _isValidTransition(oldStatus, newStatus) {
        // Allow any transition if no old status
        if (!oldStatus) return true;
        
        // Same status is always valid
        if (oldStatus === newStatus) return true;
        
        // Define valid transitions
        const validTransitions = {
            [AGENT_STATUS.CREATED]: [
                AGENT_STATUS.RUNNING,
                AGENT_STATUS.STOPPED  // When cancelled before execution starts
            ],
            [AGENT_STATUS.RUNNING]: [
                AGENT_STATUS.HALTED,
                AGENT_STATUS.STOPPED,
                AGENT_STATUS.COMPLETED,
                AGENT_STATUS.FAILED,
                AGENT_STATUS.CREATED,  // When cancelled
                AGENT_STATUS.TASKLIST_ERROR
            ],
            [AGENT_STATUS.HALTED]: [
                AGENT_STATUS.RUNNING,  // When continued
                AGENT_STATUS.STOPPED,  // When cancelled
                AGENT_STATUS.CREATED   // When cancelled
            ],
            [AGENT_STATUS.STOPPED]: [
                AGENT_STATUS.RUNNING,  // When restarted or continued
                AGENT_STATUS.CREATED   // When reset
            ],
            [AGENT_STATUS.COMPLETED]: [
                AGENT_STATUS.RUNNING   // When restarted
            ],
            [AGENT_STATUS.FAILED]: [
                AGENT_STATUS.RUNNING   // When restarted
            ],
            [AGENT_STATUS.TASKLIST_ERROR]: [
                AGENT_STATUS.RUNNING   // When restarted
            ]
        };
        
        const allowed = validTransitions[oldStatus] || [];
        return allowed.includes(newStatus);
    }
    
    /**
     * Get display text for status
     */
    getDisplayText(status) {
        return AGENT_STATUS_DISPLAY[status] || status;
    }
    
    /**
     * Get CSS class for status
     */
    getCssClass(status) {
        return AGENT_STATUS_CLASSES[status] || status;
    }
    
    /**
     * Check if agent can perform an action based on status
     */
    canStart(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent && AgentStatusPredicates.canStart(agent.status);
    }
    
    canStop(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent && AgentStatusPredicates.canStop(agent.status);
    }
    
    canContinue(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent && AgentStatusPredicates.canContinue(agent.status);
    }
    
    canEdit(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent && AgentStatusPredicates.canEdit(agent.status);
    }
    
    canDelete(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent && AgentStatusPredicates.canDelete(agent.status);
    }
    
    /**
     * Get agent status
     */
    getStatus(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        return agent ? agent.status : null;
    }
}
