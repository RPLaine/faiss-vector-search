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
 * - Control panel events (delegated to ControlPanelHandler)
 * - Selection coordination (delegated to SelectionHandler)
 */

import { SCROLL_DELAYS, POSITIONING_DELAYS } from '../constants.js';
import { APIService } from '../services/api-service.js';

export class UIManager {
    constructor(agentController, taskController, agentRenderer, canvasManager, modalManager, controlPanelManager, selectionHandler = null) {
        this.agentController = agentController;
        this.taskController = taskController;
        this.agentRenderer = agentRenderer;
        this.canvasManager = canvasManager;
        this.modalManager = modalManager;
        this.controlPanelManager = controlPanelManager;
        this.selectionHandler = selectionHandler;
        this.taskManager = null; // Will be set externally
        this.agentManager = null; // Will be set externally for agent queries
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
        
        let resizeTimeout = null;
        const resizeObserver = new ResizeObserver(() => {
            // Skip recalculation if transitions are disabled (manual expand/collapse in progress)
            if (this.canvasManager.transitionManager && 
                !this.canvasManager.transitionManager.transitionsEnabled) {
                return;
            }
            
            // Debounce: Wait for resize to stabilize before recalculating positions
            // This prevents excessive recalculations during CSS transitions
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.canvasManager.recalculateAllPositions();
            }, POSITIONING_DELAYS.RESIZE_OBSERVER_DEBOUNCE);
        });
        
        resizeObserver.observe(contentContainer);
        
        if (!node._observers) {
            node._observers = [];
        }
        node._observers.push(resizeObserver);
    }
    
    // ========================================
    // Agent Selection Handler (Delegated to SelectionHandler)
    // ========================================
    
    handleSelectAgent(agentId) {
        if (!this.selectionHandler) {
            console.error('[UIManager] SelectionHandler not set');
            return;
        }
        
        this.selectionHandler.selectAgent(agentId);
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
