/**
 * Agent Controller - Handles agent business logic and lifecycle
 * 
 * Coordinates between:
 * - AgentManager (state)
 * - APIService (backend communication)
 * - AgentRenderer (UI updates)
 */

import { APIService } from '../services/api-service.js';

export class AgentController {
    constructor(agentManager, agentRenderer, taskManager = null) {
        this.agentManager = agentManager;
        this.renderer = agentRenderer;
        this.taskManager = taskManager; // Injected dependency for task queries
    }
    
    /**
     * Start an agent
     */
    async startAgent(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // Get halt setting from agent state
        const halt = agent.halt || false;
        
        console.log(`[Agent ${agentId}] Starting (halt: ${halt})`);
        
        // Call API
        const result = await APIService.startAgent(agentId, halt);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        // Update UI
        this.renderer.clearContent(agentId);
        // Note: Action buttons are managed by ControlPanelManager based on status
        
        console.log(`[Agent ${agentId}] Started successfully`);
    }
    
    /**
     * Stop an agent
     */
    async stopAgent(agentId) {
        console.log(`[Agent ${agentId}] Stopping`);
        
        const result = await APIService.stopAgent(agentId);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`[Agent ${agentId}] Stopped successfully`);
    }
    
    /**
     * Continue an agent from halt
     */
    async continueAgent(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        console.log(`[Agent ${agentId}] Continuing from phase ${agent.current_phase}`);
        
        const result = await APIService.continueAgent(agentId);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        // Note: Control panel updates automatically via status changes
        
        console.log(`[Agent ${agentId}] Continued successfully`);
    }
    
    /**
     * Redo a phase or restart completed agent
     */
    async redoPhase(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // If agent is completed or failed, use /start to restart
        // If agent is halted, check for failed tasks to redo or redo current phase
        if (agent.status === 'completed' || agent.status === 'failed') {
            const confirmMsg = `Restart this agent from the beginning?`;
            if (!confirm(confirmMsg)) return;
            
            console.log(`[Agent ${agentId}] Restarting completed agent`);
            
            // Use start endpoint for completed agents
            const result = await APIService.startAgent(agentId, agent.halt || false);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            // Update UI
            this.renderer.clearContent(agentId);
            // Note: Action buttons are managed by ControlPanelManager based on status
            
            console.log(`[Agent ${agentId}] Restart initiated`);
        } else if (agent.status === 'halted') {
            // Check if there are failed tasks
            const hasFailedTasks = this.taskManager?.hasFailedTasks(agentId);
            
            if (hasFailedTasks) {
                // Redo the first failed task
                const failedTask = this.taskManager.getFirstFailedTask(agentId);
                const confirmMsg = `Redo failed task "${failedTask.element.querySelector('h4').textContent}"?`;
                if (!confirm(confirmMsg)) return;
                
                console.log(`[Agent ${agentId}] Redoing failed task ${failedTask.taskId}`);
                
                const result = await APIService.redoFailedTask(agentId);
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                // Note: Control panel updates automatically via status changes
                
                console.log(`[Agent ${agentId}] Task redo initiated`);
            } else {
                // No failed tasks, redo current phase
                const phaseToRedo = agent.current_phase || 0;
                const confirmMsg = `Redo phase ${phaseToRedo}? This will restart from this phase.`;
                if (!confirm(confirmMsg)) return;
                
                console.log(`[Agent ${agentId}] Redoing phase ${phaseToRedo}`);
                
                const result = await APIService.redoPhase(agentId, phaseToRedo);
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                // Update UI
                this.renderer.clearContent(agentId);
                // Note: Action buttons are managed by ControlPanelManager based on status
                
                console.log(`[Agent ${agentId}] Redo initiated`);
            }
        }
    }
    
    /**
     * Create a new agent
     */
    async createAgent(name, context, temperature, auto = false) {
        console.log(`[AgentController] Creating agent: ${name || '(default)'}`);
        
        const result = await APIService.createAgent(name, context, temperature, auto);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`[Agent ${result.data.id}] Created successfully`);
        return result.data;
    }
    
    /**
     * Update an agent
     */
    async updateAgent(agentId, updates) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // Check if agent is running
        if (agent.status === 'running') {
            throw new Error('Cannot edit a running agent. Please stop it first.');
        }
        
        console.log(`[Agent ${agentId}] Updating`);
        
        const result = await APIService.updateAgent(agentId, updates);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`[Agent ${agentId}] Updated successfully`);
        return result.data;
    }
    
    /**
     * Delete an agent
     */
    async deleteAgent(agentId) {
        console.log(`[Agent ${agentId}] Deleting`);
        
        const result = await APIService.deleteAgent(agentId);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`[Agent ${agentId}] Deleted successfully`);
        return true;
    }
    
    /**
     * Toggle auto mode
     */
    async toggleAuto(agentId, enabled) {
        // Update local state immediately
        const agent = this.agentManager.getAgent(agentId);
        if (agent) {
            agent.auto = enabled;
        }
        
        console.log(`[Agent ${agentId}] Auto: ${enabled}`);
        
        // Update backend asynchronously
        const result = await APIService.setAgentAuto(agentId, enabled);
        
        if (!result.success) {
            console.error(`[Agent ${agentId}] Failed to update auto:`, result.error);
        }
    }
    
    /**
     * Toggle halt mode
     */
    async toggleHalt(agentId, enabled) {
        // Update local state immediately
        const agent = this.agentManager.getAgent(agentId);
        if (agent) {
            agent.halt = enabled;
        }
        
        console.log(`[Agent ${agentId}] Halt: ${enabled}`);
        
        // Update backend asynchronously
        const result = await APIService.setAgentHalt(agentId, enabled);
        
        if (!result.success) {
            console.error(`[Agent ${agentId}] Failed to update halt:`, result.error);
        }
    }
    
    /**
     * Toggle expanded mode
     */
    async toggleExpanded(agentId, enabled) {
        // Update local state immediately
        const agent = this.agentManager.getAgent(agentId);
        if (agent) {
            agent.expanded = enabled;
        }
        
        console.log(`[Agent ${agentId}] Expanded: ${enabled}`);
        
        // Update UI
        this.renderer.setContentExpanded(agentId, enabled);
        
        // Update backend asynchronously
        const result = await APIService.setAgentExpanded(agentId, enabled);
        
        if (!result.success) {
            console.error(`[Agent ${agentId}] Failed to update expanded:`, result.error);
        }
    }
    
    /**
     * Clear completed agents
     */
    async clearCompleted() {
        const result = await APIService.clearCompletedAgents();
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log('Cleared completed agents');
    }
}
