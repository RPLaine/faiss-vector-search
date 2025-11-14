/**
 * AI Journalist Agents Demo - Main Application
 * 
 * Clean Architecture:
 * - Service Layer: APIService, WebSocketService, StatsService, FormHandler, LoggerService, ModalManager, RecoveryManager
 * - Handler Layer: WebSocketEventHandler, ControlPanelHandler, AgentStatusHandler, TaskStatusHandler, SelectionHandler
 * - Controller Layer: AgentController, TaskController
 * - Renderer Layer: AgentRenderer, TaskRenderer
 * - State Layer: AgentManager, TaskManager
 * - UI Layer: UIManager, CanvasManager, CanvasInitializer, TransitionManager, ControlPanelManager, ConnectionLinesManager
 * 
 * App class responsibility: Dependency injection and initialization only.
 */

import { WebSocketService } from './services/websocket-service.js';
import { AgentManager } from './state/agent-manager.js';
import { APIService } from './services/api-service.js';
import { StatsService } from './services/stats-service.js';
import { FormHandler } from './services/form-handler.js';
import { LoggerService } from './services/logger-service.js';
import { ModalManager } from './services/modal-manager.js';
import { TransitionManager } from './ui/transition-manager.js';
import { ControlPanelManager } from './ui/control-panel-manager.js';
import { WebSocketEventHandler } from './handlers/websocket-event-handler.js';
import { ControlPanelHandler } from './handlers/control-panel-handler.js';
import { SelectionHandler } from './handlers/selection-handler.js';
import { AgentController } from './controllers/agent-controller.js';
import { TaskController } from './controllers/task-controller.js';
import { HaltController } from './controllers/halt-controller.js';
import { AgentRenderer } from './renderers/agent-renderer.js';
import { TaskRenderer } from './renderers/task-renderer.js';
import { UIManager } from './ui/ui-manager.js';
import { TaskManager } from './state/task-manager.js';
import { CanvasManager } from './ui/canvas-manager.js';
import { CanvasInitializer } from './ui/canvas-initializer.js';

class App {
    constructor() {
        // Services (order matters for dependencies)
        this.transitionManager = new TransitionManager();
        this.modalManager = new ModalManager();
        this.modalManager.setupGlobalClosers();
        
        // State managers (Note: TaskManager is injected into CanvasManager for connection lines)
        this.agentManager = new AgentManager();
        this.taskManager = new TaskManager(null, this.transitionManager); // canvasManager will be set below
        this.canvasManager = new CanvasManager('agentCanvas', this.taskManager, this.transitionManager, this.agentManager);
        this.taskManager.canvasManager = this.canvasManager;
        
        // Control Panel Manager (inject TaskManager for interrupted workflow detection)
        this.controlPanelManager = new ControlPanelManager(this.taskManager);
        
        // Services
        this.statsService = new StatsService(this.agentManager);
        this.formHandler = new FormHandler();
        this.loggerService = new LoggerService();
        
        // Renderers
        this.agentRenderer = new AgentRenderer('#agentNodesContainer');
        this.taskRenderer = new TaskRenderer('#agentNodesContainer');
        
        // Controllers (with full dependency injection)
        this.agentController = new AgentController(
            this.agentManager, 
            this.agentRenderer,
            this.taskManager  // Inject TaskManager for failed task queries
        );
        this.taskController = new TaskController(this.taskManager, this.taskRenderer, this.canvasManager, this.agentManager);
        this.haltController = new HaltController(this.agentManager);
        
        // Selection Handler (centralized selection coordination)
        this.selectionHandler = new SelectionHandler(
            this.agentManager,
            this.agentRenderer,
            this.taskController,
            this.controlPanelManager,
            this.canvasManager
        );
        
        // Inject getSelectedAgentId callback into ControlPanelManager
        this.controlPanelManager.getSelectedAgentId = () => this.selectionHandler.getSelectedAgentId();
        
        // Handlers (event handling layer)
        this.controlPanelHandler = new ControlPanelHandler(
            this.agentController,
            this.haltController,
            this.modalManager,
            this.controlPanelManager,
            this.agentManager,
            this.canvasManager
        );
        
        // UI Manager (coordination) with dependency injection
        this.uiManager = new UIManager(
            this.agentController,
            this.taskController,
            this.agentRenderer,
            this.canvasManager,
            this.modalManager,
            this.controlPanelManager,
            this.selectionHandler  // Inject SelectionHandler
        );
        this.uiManager.taskManager = this.taskManager;
        this.uiManager.agentManager = this.agentManager; // Inject AgentManager
        
        // Canvas Initializer (handles page load initialization)
        this.canvasInitializer = new CanvasInitializer(
            this.agentManager,
            this.taskController,
            this.uiManager,
            this.canvasManager,
            this.statsService,
            this.selectionHandler  // Inject SelectionHandler for initial selection
        );
        
        // WebSocket service
        this.wsService = new WebSocketService('ws://localhost:8001/ws');
        
        // WebSocket event handler
        this.wsEventHandler = new WebSocketEventHandler(
            this.agentManager,
            this.agentController,
            this.taskController,
            this.uiManager,
            this.canvasManager,
            this.taskManager,
            this.canvasInitializer
        );
        
        this.init();
    }
    
    init() {
        // Set up connection state callback
        this.wsService.setConnectionStateCallback((connected) => {
            this.uiManager.setConnected(connected);
        });
        
        // Initialize WebSocket handlers
        this.wsEventHandler.registerHandlers(this.wsService, this.statsService);
        
        // Add LLM action logger to event handler
        this.wsService.on('action', (data) => {
            this.loggerService.logLLMAction(data);
        });
        
        // Initialize UI event handlers
        this.setupUIHandlers();
        
        // Connect to server
        this.wsService.connect();
    }
    
    setupUIHandlers() {
        this.formHandler.setupEventListeners({
            onAddAgent: () => this.modalManager.openCreateAgentModal(),
            onClearCompleted: async () => await this.agentController.clearCompleted(),
            onCreateAgent: async () => await this.handleCreateAgent(),
            onEditAgent: async () => await this.handleEditAgent()
        });
    }
    
    async handleCreateAgent() {
        try {
            const formData = this.modalManager.getCreateAgentData();
            await this.agentController.createAgent(
                formData.name,
                formData.context,
                formData.temperature,
                false
            );
            
            this.modalManager.closeCreateAgentModal();
            this.modalManager.resetCreateAgentForm();
            
        } catch (error) {
            this.loggerService.error('Failed to create agent:', error);
            alert(`Failed to create agent: ${error.message}`);
        }
    }
    
    async handleEditAgent() {
        try {
            const formData = this.modalManager.getEditAgentData();
            await this.agentController.updateAgent(formData.agentId, {
                name: formData.name,
                context: formData.context,
                temperature: formData.temperature
            });
            
            this.modalManager.closeEditAgentModal();
            
        } catch (error) {
            this.loggerService.error('Failed to update agent:', error);
            alert(`Failed to update agent: ${error.message}`);
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
    });
} else {
    window.app = new App();
}
