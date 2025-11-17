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
    constructor(agentManager, agentRenderer, taskManager = null, agentStatusHandler = null) {
        this.agentManager = agentManager;
        this.renderer = agentRenderer;
        this.taskManager = taskManager; // Injected dependency for task queries
        this.agentStatusHandler = agentStatusHandler; // Injected dependency for centralized status updates
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
        // Check current state before making API call
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // Only attempt to stop if agent is actually running
        if (agent.status !== 'running') {
            console.info(`[Agent ${agentId}] Stop ignored - agent is ${agent.status}, not running`);
            return;
        }
        
        console.log(`[Agent ${agentId}] Stopping`);
        
        const result = await APIService.stopAgent(agentId);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        console.log(`[Agent ${agentId}] Stopped successfully`);
    }
    
    /**
     * Continue an agent from halt or retry failed/cancelled tasks
     */
    async continueAgent(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // Check if agent can be continued based on current status
        const validContinueStates = ['halted', 'stopped', 'failed'];
        if (!validContinueStates.includes(agent.status)) {
            console.info(`[Agent ${agentId}] Continue ignored - agent is ${agent.status}, expected one of: ${validContinueStates.join(', ')}`);
            return;
        }
        
        // When agent is stopped or failed and there is a tasklist, check for next non-complete task
        if ((agent.status === 'stopped' || agent.status === 'failed') && this.taskManager) {
            // First check if there are failed or cancelled tasks to retry
            const hasFailedOrCancelled = this.taskManager.hasFailedOrCancelledTasks(agentId);
            
            if (hasFailedOrCancelled) {
                // Get first failed/cancelled task
                const failedTask = this.taskManager.getFirstFailedOrCancelledTask(agentId);
                if (failedTask) {
                    const taskStatus = failedTask.element.querySelector('.task-node-status')?.textContent || 'failed';
                    
                    console.log(`[Agent ${agentId}] Continuing from ${taskStatus} task ${failedTask.taskId}`);
                    
                    // Call special endpoint to continue from failed task
                    const result = await APIService.continueFromFailedTask(agentId);
                    
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                    
                    // Immediately update agent status to running (optimistic update)
                    if (this.agentStatusHandler) {
                        this.agentStatusHandler.updateStatus(agentId, 'running');
                    } else {
                        this.agentManager.updateAgentStatus(agentId, 'running');
                        this.renderer.updateStatus(agentId, 'running');
                    }
                    
                    console.log(`[Agent ${agentId}] Continuing from failed/cancelled task`);
                    return;
                }
            }
            
            // No failed/cancelled tasks, check for next unexecuted task (created or halted)
            const nextTask = this.taskManager.getNextUnexecutedTask(agentId);
            if (nextTask) {
                console.log(`[Agent ${agentId}] Continuing to process next non-complete task ${nextTask.taskId}`);
                
                // Call continue endpoint to process next task
                const result = await APIService.continueAgent(agentId);
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                // Immediately update agent status to running (optimistic update)
                if (this.agentStatusHandler) {
                    this.agentStatusHandler.updateStatus(agentId, 'running');
                } else {
                    this.agentManager.updateAgentStatus(agentId, 'running');
                    this.renderer.updateStatus(agentId, 'running');
                }
                
                console.log(`[Agent ${agentId}] Continued to next task successfully`);
                return;
            }
        }
        
        // For halted agents or normal continue flow
        if (agent.status === 'halted') {
            console.log(`[Agent ${agentId}] Continuing from halt at phase ${agent.current_phase}`);
        } else {
            console.log(`[Agent ${agentId}] Continuing from phase ${agent.current_phase}`);
        }
        
        const result = await APIService.continueAgent(agentId);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        // Immediately update agent status to running (optimistic update)
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, 'running');
        } else {
            this.agentManager.updateAgentStatus(agentId, 'running');
            this.renderer.updateStatus(agentId, 'running');
        }
        
        console.log(`[Agent ${agentId}] Continued successfully`);
    }
    
    /**
     * Restart agent from phase 0 (full restart)
     */
    async restartAgent(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        const confirmMsg = `Restart this agent from the beginning? This will clear all progress.`;
        if (!confirm(confirmMsg)) return;
        
        console.log(`[Agent ${agentId}] Restarting from phase 0`);
        
        // Use start endpoint to restart from beginning
        const result = await APIService.startAgent(agentId, agent.halt || false);
        
        if (!result.success) {
            throw new Error(result.error);
        }
        
        // Update UI
        this.renderer.clearContent(agentId);
        
        console.log(`[Agent ${agentId}] Restart initiated`);
    }
    
    /**
     * Redo a phase or retry failed task (halt mode only)
     */
    async redoPhase(agentId) {
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        // Redo logic for halted/stopped/completed/failed agents in halt mode
        if (agent.status === 'halted' || agent.status === 'stopped' || agent.status === 'completed' || agent.status === 'failed') {
            // Check if there are failed tasks
            const hasFailedTasks = this.taskManager?.hasFailedTasks(agentId);
            
            if (hasFailedTasks) {
                // Redo the first failed task
                const failedTask = this.taskManager.getFirstFailedTask(agentId);
                
                console.log(`[Agent ${agentId}] Redoing failed task ${failedTask.taskId}`);
                
                const result = await APIService.redoFailedTask(agentId);
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                // Immediately update agent status to running (optimistic update)
                if (this.agentStatusHandler) {
                    this.agentStatusHandler.updateStatus(agentId, 'running');
                } else {
                    this.agentManager.updateAgentStatus(agentId, 'running');
                    this.renderer.updateStatus(agentId, 'running');
                }
                
                console.log(`[Agent ${agentId}] Task redo initiated`);
            } else {
                // No failed tasks, redo tasklist generation
                console.log(`[Agent ${agentId}] Redoing tasklist generation`);
                
                const result = await APIService.redoTasklist(agentId);
                
                if (!result.success) {
                    throw new Error(result.error);
                }
                
                // Immediately update agent status to running (optimistic update)
                if (this.agentStatusHandler) {
                    this.agentStatusHandler.updateStatus(agentId, 'running');
                } else {
                    this.agentManager.updateAgentStatus(agentId, 'running');
                    this.renderer.updateStatus(agentId, 'running');
                }
                
                // Clear UI content
                this.renderer.clearContent(agentId);
                
                // Clear tasks immediately (new tasklist will be generated)
                if (this.taskController) {
                    this.taskController._clearTasksImmediate(agentId);
                }
                
                console.log(`[Agent ${agentId}] Redo initiated`);
            }
        } else {
            console.warn(`[Agent ${agentId}] Cannot redo - invalid status: ${agent.status}`);
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
