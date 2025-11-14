/**
 * Halt Controller - Manages halt-related business logic
 * 
 * Responsibilities:
 * - Toggle halt mode on/off
 * - Determine halt state from agent status
 * - Coordinate halt operations with backend
 * 
 * Delegation:
 * - APIService: Backend communication
 * - AgentManager: State management
 * 
 * Layer: Controller (Business logic)
 */

import { APIService } from '../services/api-service.js';

export class HaltController {
    constructor(agentManager) {
        this.agentManager = agentManager;
    }
    
    /**
     * Toggle halt mode for an agent
     * 
     * @param {string} agentId - The agent ID
     * @param {boolean} enabled - True to enable halt, false to disable
     * @returns {Promise<boolean>} Success status
     */
    async toggleHalt(agentId, enabled) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            console.error(`[HaltController] Agent ${agentId} not found`);
            return false;
        }
        
        // Update local state immediately for responsive UI
        agent.halt = enabled;
        
        console.log(`[HaltController] Agent ${agentId} halt: ${enabled}`);
        
        // Update backend asynchronously
        const result = await APIService.setAgentHalt(agentId, enabled);
        
        if (!result.success) {
            console.error(`[HaltController] Failed to update halt for agent ${agentId}:`, result.error);
            // Revert local state on failure
            agent.halt = !enabled;
            return false;
        }
        
        return true;
    }
    
    /**
     * Check if agent is in halted state
     * 
     * @param {string} agentId - The agent ID
     * @returns {boolean} True if agent is halted
     */
    isHalted(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return false;
        }
        
        return agent.status === 'halted';
    }
    
    /**
     * Check if agent has halt enabled
     * 
     * @param {string} agentId - The agent ID
     * @returns {boolean} True if halt is enabled
     */
    isHaltEnabled(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return false;
        }
        
        return agent.halt || false;
    }
    
    /**
     * Check if agent can continue from halted state
     * 
     * @param {string} agentId - The agent ID
     * @returns {boolean} True if agent can continue
     */
    canContinue(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return false;
        }
        
        // Agent can continue if halted or stopped
        return agent.status === 'halted' || agent.status === 'stopped';
    }
    
    /**
     * Get halt-related UI state for an agent
     * 
     * @param {string} agentId - The agent ID
     * @returns {Object} UI state object with halt information
     */
    getHaltUIState(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            return {
                haltEnabled: false,
                isHalted: false,
                canContinue: false,
                showContinueButton: false
            };
        }
        
        const isHalted = this.isHalted(agentId);
        const canContinue = this.canContinue(agentId);
        
        return {
            haltEnabled: agent.halt || false,
            isHalted: isHalted,
            canContinue: canContinue,
            showContinueButton: canContinue
        };
    }
}
