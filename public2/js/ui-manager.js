/**
 * UI Manager (Refactored) - UI Coordination Layer
 * 
 * Responsibilities:
 * - Coordinate between controllers and renderers
 * - Handle UI events and delegate to controllers
 * - Update UI based on state changes
 * 
 * NOT responsible for:
 * - Direct DOM manipulation (delegated to renderers)
 * - Business logic (delegated to controllers)
 * - API calls (delegated to controllers → APIService)
 * - Modal management (delegated to ModalManager)
 */

import { SCROLL_DELAYS } from './constants.js';
import { APIService } from './services/api-service.js';

export class UIManager {
    constructor(agentController, taskController, agentRenderer, canvasManager, modalManager, controlPanelManager) {
        this.agentController = agentController;
        this.taskController = taskController;
        this.agentRenderer = agentRenderer;
        this.canvasManager = canvasManager;
        this.modalManager = modalManager;
        this.controlPanelManager = controlPanelManager;
        this.taskManager = null; // Will be set externally
        this.agentManager = null; // Will be set externally for agent queries
        
        // Setup control panel event handlers
        this._setupControlPanelHandlers();
    }
    
    /**
     * Setup control panel event handlers
     */
    _setupControlPanelHandlers() {
        this.controlPanelManager.setHandlers({
            onAction: (agentId) => this.handleActionButton(agentId),
            onContinue: (agentId) => this.handleContinueAgent(agentId),
            onEdit: (agentId) => this.handleEditAgent(agentId),
            onDelete: (agentId) => this.handleDeleteAgent(agentId),
            onAutoToggle: (agentId, enabled) => this.handleAutoToggle(agentId, enabled),
            onHaltToggle: (agentId, enabled) => this.handleHaltToggle(agentId, enabled),
            onExpandToggle: (agentId, enabled) => this.handleExpandToggle(agentId, enabled)
        });
    }
    
    // ========================================
    // Connection State
    // ========================================
    
    setConnected(connected) {
        const indicator = document.getElementById('statusIndicator');
        const text = document.getElementById('statusText');
        
        if (connected) {
            indicator.classList.add('connected');
            indicator.classList.remove('disconnected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.remove('connected');
            indicator.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }
    
    // ========================================
    // Agent Rendering (Delegated)
    // ========================================
    
    renderAgent(agent) {
        // Define event handlers for agent node (selection only)
        const eventHandlers = {
            onSelect: (agentId) => this.handleSelectAgent(agentId)
        };
        
        // Render using renderer
        const node = this.agentRenderer.renderAgent(agent, eventHandlers);
        
        // Position node using canvas manager
        this.canvasManager.addAgent(agent.id, node);
        
        // Observe content changes for layout updates
        this._observeContentChanges(agent.id, node);
        
        // Apply status-specific UI changes for restored agents
        if (agent.status && agent.status !== 'created') {
            requestAnimationFrame(() => {
                this.updateAgentStatus(agent.id, agent.status);
            });
        }
    }
    
    _observeContentChanges(agentId, node) {
        const contentContainer = node.querySelector(`#content-container-${agentId}`);
        if (!contentContainer) return;
        
        const resizeObserver = new ResizeObserver(() => {
            // Delegate to centralized canvas recalculation
            this.canvasManager.recalculateAllPositions();
        });
        
        resizeObserver.observe(contentContainer);
        
        if (!node._observers) {
            node._observers = [];
        }
        node._observers.push(resizeObserver);
    }
    
    // ========================================
    // Agent Event Handlers (Delegate to Controller)
    // ========================================
    
    async handleActionButton(agentId) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        const actionBtn = node.querySelector('.btn-action');
        if (!actionBtn) return;
        
        const action = actionBtn.dataset.action;
        
        try {
            if (action === 'start') {
                await this.agentController.startAgent(agentId);
            } else if (action === 'stop') {
                await this.agentController.stopAgent(agentId);
            } else if (action === 'redo') {
                await this.agentController.redoPhase(agentId);
            }
        } catch (error) {
            console.error(`Action '${action}' failed:`, error);
            alert(`Failed to ${action} agent: ${error.message}`);
        }
    }
    
    async handleContinueAgent(agentId) {
        try {
            await this.agentController.continueAgent(agentId);
        } catch (error) {
            console.error('Continue failed:', error);
            alert(`Failed to continue agent: ${error.message}`);
        }
    }
    
    handleEditAgent(agentId) {
        const agent = this.agentManager?.getAgent(agentId);
        if (!agent) {
            alert('Agent not found');
            return;
        }
        
        if (agent.status === 'running') {
            alert('Cannot edit a running agent. Please stop it first.');
            return;
        }
        
        // Populate and open edit modal via ModalManager
        this.modalManager.populateEditAgentModal(agent);
        this.modalManager.openEditAgentModal();
    }
    
    async handleDeleteAgent(agentId) {
        try {
            const deleted = await this.agentController.deleteAgent(agentId);
            // Deletion is handled by WebSocket event
        } catch (error) {
            console.error('Delete failed:', error);
            alert(`Failed to delete agent: ${error.message}`);
        }
    }
    
    async handleAutoToggle(agentId, enabled) {
        await this.agentController.toggleAuto(agentId, enabled);
    }
    
    async handleHaltToggle(agentId, enabled) {
        await this.agentController.toggleHalt(agentId, enabled);
    }
    
    async handleExpandToggle(agentId, enabled) {
        await this.agentController.toggleExpanded(agentId, enabled);
        
        // Wait for CSS transition, then recenter
        requestAnimationFrame(() => {
            setTimeout(() => {
                this.canvasManager.scrollAgentToCenter(agentId);
            }, SCROLL_DELAYS.RECENTER_AFTER_EXPAND);
        });
    }
    
    handleSelectAgent(agentId) {
        console.log(`[UIManager] Selecting agent ${agentId}`);
        
        // Get previously selected agent
        const previouslySelected = this.agentManager.getSelectedAgentId();
        
        // If clicking the already-selected agent, do nothing
        if (previouslySelected === agentId) {
            return;
        }
        
        // Deselect previous agent
        if (previouslySelected) {
            this.agentRenderer.setSelected(previouslySelected, false);
            this.taskController.hideTasksForAgent(previouslySelected);
        }
        
        // Select new agent
        this.agentManager.selectAgent(agentId);
        this.agentRenderer.setSelected(agentId, true);
        
        // Update control panel with selected agent state
        const selectedAgent = this.agentManager.getAgent(agentId);
        if (selectedAgent) {
            // Add hasFailedTasks flag to agent object for control panel
            const agentWithTaskInfo = {
                ...selectedAgent,
                hasFailedTasks: this.taskManager?.hasFailedTasks(agentId)
            };
            this.controlPanelManager.updateForAgent(agentWithTaskInfo);
        }
        
        // Show tasks for selected agent
        this.taskController.showTasksForAgent(agentId);
        
        // Recalculate agent positions (selected agent moves right, unselected move left)
        this.canvasManager.recalculateAgentPositions();
        
        // Recalculate task positions for the newly selected agent
        if (this.taskManager.getAgentTasks(agentId)?.length > 0) {
            this.taskController.positionTasksForAgent(agentId);
        }
        
        // Persist selection to backend
        APIService.selectAgent(agentId).catch(error => {
            console.error(`[UIManager] Failed to persist agent selection: ${error}`);
        });
    }
    
    // ========================================
    // Agent UI Updates (Delegate to Renderer)
    // ========================================
    
    updateAgentStatus(agentId, status) {
        console.log(`updateAgentStatus: ${agentId}, status: ${status}`);
        
        // Update renderer
        this.agentRenderer.updateStatus(agentId, status);
        
        // Get agent info for control panel update
        const agent = this.agentManager?.getAgent(agentId);
        const hasFailedTasks = this.taskManager?.hasFailedTasks(agentId);
        
        // Update control panel if this is the selected agent
        if (agent) {
            const agentWithTaskInfo = {
                ...agent,
                hasFailedTasks: hasFailedTasks,
                status: status
            };
            this.controlPanelManager.updateStatus(agentId, status, agentWithTaskInfo);
        }
    }
    
    updateAgentFields(agent) {
        this.agentRenderer.updateFields(agent);
    }
    
    clearAgentContent(agentId) {
        this.agentRenderer.clearContent(agentId);
    }
    
    updatePhaseContent(agentId, phaseIndex, content, append = false) {
        this.agentRenderer.updateContent(agentId, content, append);
    }
    
    showAgentError(agentId, error) {
        this.agentRenderer.updateStatus(agentId, 'failed');
        this.agentRenderer.showError(agentId, error);
    }
    
    removeAgent(agentId) {
        this.agentRenderer.removeAgent(agentId);
        this.canvasManager.removeAgent(agentId);
    }
    
    // ========================================
    // Workflow Updates (Placeholder)
    // ========================================
    
    updateWorkflowPhase(agentId, phaseIndex, status = 'active') {
        const phaseNames = [
            'Create Tasklist',
            'Get Sources',
            'Extract Data',
            'Find Names',
            'Send Contacts',
            'Receive Info',
            'Write Article'
        ];
        
        console.log(`Agent ${agentId} - Phase ${phaseIndex}: ${phaseNames[phaseIndex] || 'Unknown'} (${status})`);
    }
    
    startAgentStreaming(agentId) {
        // Placeholder
    }
    
    appendAgentChunk(agentId, chunk) {
        // Placeholder
        console.log(`Agent ${agentId} - Chunk received`);
    }
    
    completeAgent(agentId, data) {
        this.updateAgentStatus(agentId, 'completed');
        console.log(`Agent ${agentId} completed:`, data);
    }
}
