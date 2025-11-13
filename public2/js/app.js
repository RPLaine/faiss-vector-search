/**
 * AI Journalist Agents Demo - Main Application
 * 
 * Clean Architecture:
 * - Service Layer: APIService, WebSocketService, StatsService, FormHandler, LoggerService
 * - Handler Layer: WebSocketEventHandler
 * - Controller Layer: AgentController, TaskController
 * - Renderer Layer: AgentRenderer, TaskRenderer
 * - State Layer: AgentManager, TaskManager
 * - UI Coordination: UIManager, CanvasManager (includes connection lines)
 * 
 * App class responsibility: Dependency injection and initialization only.
 */

import { WebSocketService } from './websocket.js';
import { AgentManager } from './agent-manager.js';
import { APIService } from './services/api-service.js';
import { StatsService } from './services/stats-service.js';
import { FormHandler } from './services/form-handler.js';
import { LoggerService } from './services/logger-service.js';
import { WebSocketEventHandler } from './handlers/websocket-event-handler.js';
import { AgentController } from './controllers/agent-controller.js';
import { TaskController } from './controllers/task-controller.js';
import { AgentRenderer } from './renderers/agent-renderer.js';
import { TaskRenderer } from './renderers/task-renderer.js';
import { UIManager } from './ui-manager.js';
import { TaskManager } from './task-manager.js';
import { CanvasManager } from './canvas-manager.js';

class App {
    constructor() {
        // State managers (Note: TaskManager is injected into CanvasManager for connection lines)
        this.agentManager = new AgentManager();
        this.taskManager = new TaskManager(null); // canvasManager will be set below
        this.canvasManager = new CanvasManager('agentCanvas', this.taskManager);
        this.taskManager.canvasManager = this.canvasManager;
        
        // Services
        this.statsService = new StatsService(this.agentManager);
        this.formHandler = new FormHandler();
        this.loggerService = new LoggerService();
        
        // Renderers
        this.agentRenderer = new AgentRenderer('#agentNodesContainer');
        this.taskRenderer = new TaskRenderer('#agentNodesContainer');
        
        // Controllers
        this.agentController = new AgentController(this.agentManager, this.agentRenderer);
        this.taskController = new TaskController(this.taskManager, this.taskRenderer, this.canvasManager);
        
        // UI Manager (coordination)
        this.uiManager = new UIManager(
            this.agentController,
            this.taskController,
            this.agentRenderer,
            this.canvasManager
        );
        this.uiManager.taskManager = this.taskManager;
        
        // WebSocket service
        this.wsService = new WebSocketService('ws://localhost:8001/ws');
        
        // WebSocket event handler
        this.wsEventHandler = new WebSocketEventHandler(
            this.agentManager,
            this.agentController,
            this.taskController,
            this.uiManager,
            this.canvasManager,
            this.taskManager
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
            onAddAgent: () => this.uiManager.openCreateAgentModal(),
            onClearCompleted: async () => await this.agentController.clearCompleted(),
            onCreateAgent: async () => await this.handleCreateAgent(),
            onEditAgent: async () => await this.handleEditAgent()
        });
    }
    
    async handleCreateAgent() {
        try {
            const formData = this.formHandler.getCreateAgentData();
            await this.agentController.createAgent(
                formData.name,
                formData.context,
                formData.temperature,
                false
            );
            
            this.uiManager.closeCreateAgentModal();
            this.formHandler.resetCreateAgentForm();
            
        } catch (error) {
            this.loggerService.error('Failed to create agent:', error);
            alert(`Failed to create agent: ${error.message}`);
        }
    }
    
    async handleEditAgent() {
        try {
            const formData = this.formHandler.getEditAgentData();
            await this.agentController.updateAgent(formData.agentId, {
                name: formData.name,
                context: formData.context,
                temperature: formData.temperature
            });
            
            this.uiManager.closeEditAgentModal();
            
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

// Global functions for modals
window.closeCreateAgentModal = () => {
    document.getElementById('createAgentModal').classList.remove('active');
};

window.closeEditAgentModal = () => {
    document.getElementById('editAgentModal').classList.remove('active');
};
