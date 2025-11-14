/**
 * Canvas Initializer - Handles initial setup of canvas elements and agent/task state
 * 
 * Responsibilities:
 * - Initialize canvas elements when page loads
 * - Restore agent state from backend
 * - Set up initial selection state
 * - Coordinate initial positioning and visibility
 * 
 * This module ensures proper initialization order:
 * 1. Agents are rendered and positioned
 * 2. Tasks are created for each agent
 * 3. First agent is auto-selected
 * 4. Non-selected agents' tasks are hidden
 * 5. Canvas is sized appropriately
 */

import { POSITIONING_DELAYS } from './constants.js';

export class CanvasInitializer {
    constructor(agentManager, taskController, uiManager, canvasManager, statsService) {
        this.agentManager = agentManager;
        this.taskController = taskController;
        this.uiManager = uiManager;
        this.canvasManager = canvasManager;
        this.statsService = statsService;
    }
    
    /**
     * Initialize canvas with agents from backend state
     * Called when WebSocket connection is established
     */
    async initializeFromBackend(agents, selectedAgentId = null) {
        if (!agents || agents.length === 0) {
            console.log('[CanvasInitializer] No agents to initialize');
            this.statsService.update();
            return;
        }
        
        console.log(`[CanvasInitializer] Initializing ${agents.length} agents (selected: ${selectedAgentId})`);
        
        // Use backend-provided selection, or default to first agent
        let targetSelectedAgentId = selectedAgentId;
        if (!targetSelectedAgentId || !agents.find(a => a.id === targetSelectedAgentId)) {
            targetSelectedAgentId = agents[0].id;
        }
        
        const agentsWithTasks = [];
        
        // Step 1: Render all agents and set selection state
        agents.forEach((agent) => {
            if (!this.agentManager.getAgent(agent.id)) {
                const isSelected = agent.id === targetSelectedAgentId;
                
                // Add to state
                this.agentManager.addAgent(agent);
                if (isSelected) {
                    this.agentManager.selectAgent(agent.id);
                }
                
                // Render UI (this adds the DOM node)
                this.uiManager.renderAgent(agent);
                
                // Track agents that have tasks
                if (agent.tasklist && agent.tasklist.tasks && agent.tasklist.tasks.length > 0) {
                    agentsWithTasks.push({
                        id: agent.id,
                        tasklist: agent.tasklist,
                        isSelected: isSelected
                    });
                }
            }
        });
        
        // Step 2: Apply visual selection state after all nodes are rendered
        // This must happen after renderAgent() has created the DOM elements
        requestAnimationFrame(() => {
            agents.forEach((agent) => {
                const isSelected = agent.id === targetSelectedAgentId;
                this.uiManager.agentRenderer.setSelected(agent.id, isSelected);
            });
        });
        
        // Step 3: Wait for agent positioning to complete
        await this._waitForPositioning(POSITIONING_DELAYS.AGENT_POSITION_DELAY);
        
        // Step 4: Create tasks for all agents (all start hidden)
        agentsWithTasks.forEach(({ id, tasklist }) => {
            // All tasks and connections start hidden during initialization
            // The createTasksForAgent will create connection lines hidden for non-selected agents
            this.taskController.createTasksForAgent(id, tasklist);
        });
        
        // Step 5: Wait for task positioning to complete, then reveal selected agent's tasks
        await this._waitForPositioning(POSITIONING_DELAYS.TASK_POSITION_DELAY + 200);
        
        // Step 6: Show tasks and connections only for the selected agent
        const selectedAgent = agentsWithTasks.find(a => a.isSelected);
        if (selectedAgent) {
            this.taskController.showTasksForAgent(selectedAgent.id);
        }
        
        // Step 7: Update stats
        this.statsService.update();
        
        console.log('[CanvasInitializer] Initialization complete');
    }
    
    /**
     * Initialize a newly created agent
     * Called when a new agent is created via UI or API
     */
    initializeNewAgent(agent) {
        console.log(`[CanvasInitializer] Initializing new agent ${agent.id}`);
        
        // Add to state
        this.agentManager.addAgent(agent);
        
        // Render UI
        this.uiManager.renderAgent(agent);
        
        // Auto-select the new agent
        setTimeout(() => {
            this.uiManager.handleSelectAgent(agent.id);
        }, POSITIONING_DELAYS.AGENT_POSITION_DELAY);
        
        // Scroll to center the agent
        setTimeout(() => {
            this.canvasManager.scrollAgentToCenter(agent.id);
        }, POSITIONING_DELAYS.AGENT_POSITION_DELAY);
        
        // Update stats
        this.statsService.update();
    }
    
    /**
     * Initialize tasks for an agent
     * Called when agent completes Phase 0 and generates tasklist
     */
    initializeAgentTasks(agentId, tasklist) {
        console.log(`[CanvasInitializer] Initializing tasks for agent ${agentId}`);
        
        // Create tasks
        this.taskController.createTasksForAgent(agentId, tasklist);
        
        // Only show tasks if this agent is selected
        const isSelected = this.agentManager.isAgentSelected(agentId);
        if (!isSelected) {
            setTimeout(() => {
                this.taskController.hideTasksForAgent(agentId);
            }, POSITIONING_DELAYS.TASK_POSITION_DELAY + 100);
        }
    }
    
    /**
     * Clear all agents and reset canvas
     */
    clearCanvas() {
        console.log('[CanvasInitializer] Clearing canvas');
        
        const agents = this.agentManager.getAllAgents();
        
        agents.forEach(agent => {
            // Remove tasks first
            this.taskController.removeTasksForAgent(agent.id);
            
            // Remove agent UI
            this.uiManager.removeAgent(agent.id);
            
            // Remove from state
            this.agentManager.removeAgent(agent.id);
        });
        
        // Clear selection
        this.agentManager.clearSelection();
        
        // Update stats
        this.statsService.update();
        
        console.log('[CanvasInitializer] Canvas cleared');
    }
    
    /**
     * Utility: Wait for a specified duration
     */
    _waitForPositioning(delay) {
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}
