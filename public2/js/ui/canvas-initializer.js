/**
 * Canvas Initializer - Handles initial setup of canvas elements and agent/task state
 * 
 * Responsibilities:
 * - Initialize canvas elements when page loads
 * - Restore agent state from backend
 * - Set up initial selection state (via SelectionHandler)
 * - Coordinate initial positioning and visibility
 * 
 * This module ensures proper initialization order:
 * 1. Agents are rendered and positioned
 * 2. Tasks are created for each agent
 * 3. First agent is auto-selected (via SelectionHandler)
 * 4. Non-selected agents' tasks are hidden
 * 5. Canvas is sized appropriately
 */

import { POSITIONING_DELAYS, SCROLL_DELAYS } from '../constants.js';

export class CanvasInitializer {
    constructor(agentManager, taskController, uiManager, canvasManager, statsService, selectionHandler = null) {
        this.agentManager = agentManager;
        this.taskController = taskController;
        this.uiManager = uiManager;
        this.canvasManager = canvasManager;
        this.statsService = statsService;
        this.selectionHandler = selectionHandler;
    }
    
    /**
     * Initialize canvas with agents from backend state
     * Called when WebSocket connection is established
     * 
     * CRITICAL INITIALIZATION ORDER:
     * 1. Render agent nodes (DOM creation)
     * 2. Set selection state visually (CSS classes) - but DON'T call SelectionHandler yet
     * 3. Wait for agent positioning
     * 4. Create task nodes (DOM creation)
     * 5. Wait for task positioning
     * 6. NOW call selection logic (show tasks, update control panel, recalculate layout)
     * 
     * Why this order?
     * - SelectionHandler.selectAgent() calls showTasksForAgent()
     * - showTasksForAgent() requires tasks to exist in the DOM
     * - Tasks are created in Step 4, so SelectionHandler must run AFTER Step 4
     */
    async initializeFromBackend(agents, selectedAgentId = null) {
        if (!agents || agents.length === 0) {
            console.log('[CanvasInitializer] No agents to initialize');
            // Hide control panel when no agents exist
            if (this.uiManager.controlPanelManager) {
                this.uiManager.controlPanelManager.hide();
            }
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
        
        // Step 1: Render all agents WITHOUT setting selection state yet
        agents.forEach((agent) => {
            if (!this.agentManager.getAgent(agent.id)) {
                // Add to state (no selection yet)
                this.agentManager.addAgent(agent);
                
                // Render UI (this adds the DOM node)
                this.uiManager.renderAgent(agent);
                
                // Track agents that have tasks
                if (agent.tasklist && agent.tasklist.tasks && agent.tasklist.tasks.length > 0) {
                    agentsWithTasks.push({
                        id: agent.id,
                        tasklist: agent.tasklist
                    });
                }
            }
        });
        
        // Step 2: Apply initial visual selection state (WITHOUT calling SelectionHandler yet)
        // SelectionHandler will be called AFTER tasks are created to avoid showing non-existent tasks
        requestAnimationFrame(() => {
            // Update state
            this.agentManager.selectAgent(targetSelectedAgentId);
            
            // Update visual state
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
        
        // Step 6: Complete the selection via SelectionHandler (now that tasks exist)
        // This will show tasks, update control panel, and recalculate positions
        if (this.selectionHandler) {
            // Use a special internal method that doesn't check for "already selected"
            // since we pre-set the state in Step 2
            const selectedAgent = this.agentManager.getAgent(targetSelectedAgentId);
            if (selectedAgent) {
                // Show tasks for selected agent
                this.taskController.showTasksForAgent(targetSelectedAgentId);
                
                // Update control panel with task info
                const agentWithTaskInfo = {
                    ...selectedAgent,
                    hasFailedTasks: this.uiManager.taskManager?.hasFailedTasks(targetSelectedAgentId)
                };
                this.uiManager.controlPanelManager.updateForAgent(agentWithTaskInfo);
                
                // Recalculate positions
                this.canvasManager.recalculateAgentPositions();
                const agentTasks = this.taskController.taskManager?.getAgentTasks(targetSelectedAgentId);
                if (agentTasks && agentTasks.length > 0) {
                    this.taskController.positionTasksForAgent(targetSelectedAgentId);
                }
            }
        } else {
            // Fallback path
            const selectedAgent = agentsWithTasks.find(a => a.id === targetSelectedAgentId);
            if (selectedAgent) {
                this.taskController.showTasksForAgent(selectedAgent.id);
                
                // Update control panel now that tasks are loaded
                const agent = this.agentManager.getAgent(selectedAgent.id);
                if (agent && this.uiManager.controlPanelManager && this.uiManager.taskManager) {
                    const agentWithTaskInfo = {
                        ...agent,
                        hasFailedTasks: this.uiManager.taskManager.hasFailedTasks(selectedAgent.id)
                    };
                    this.uiManager.controlPanelManager.updateForAgent(agentWithTaskInfo);
                }
            }
        }
        
        // Step 7: Update stats
        this.statsService.update();
        
        // Step 8: Scroll to selected agent after all animations complete
        // Calculate delay based on number of tasks for smooth scroll timing
        const selectedAgentTasks = this.taskController.taskManager?.getAgentTasks(targetSelectedAgentId);
        const taskCount = selectedAgentTasks ? selectedAgentTasks.length : 0;
        const scrollDelay = SCROLL_DELAYS.SCROLL_AFTER_LOAD + 
                           (Math.min(taskCount, 10) * SCROLL_DELAYS.SCROLL_TASK_MULTIPLIER) + 
                           SCROLL_DELAYS.SCROLL_BUFFER;
        
        setTimeout(() => {
            this.canvasManager.scrollAgentToCenter(targetSelectedAgentId);
        }, scrollDelay);
        
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
        
        // Show or hide tasks based on selection state
        const isSelected = this.agentManager.isAgentSelected(agentId);
        setTimeout(() => {
            if (isSelected) {
                this.taskController.showTasksForAgent(agentId);
            } else {
                this.taskController.hideTasksForAgent(agentId);
            }
        }, POSITIONING_DELAYS.TASK_POSITION_DELAY + 100);
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
        
        // Clear selection and hide control panel
        this.agentManager.clearSelection();
        if (this.uiManager.controlPanelManager) {
            this.uiManager.controlPanelManager.hide();
        }
        
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
