/**
 * AI Journalist Agents Demo - Main Application (Refactored)
 * 
 * New Architecture:
 * - Service Layer: APIService, WebSocketService
 * - Controller Layer: AgentController, TaskController
 * - Renderer Layer: AgentRenderer, TaskRenderer
 * - State Layer: AgentManager, TaskManager
 * - UI Coordination: UIManager
 */

import { WebSocketService } from './websocket.js';
import { AgentManager } from './agent-manager.js';
import { APIService } from './services/api-service.js';
import { AgentController } from './controllers/agent-controller.js';
import { TaskController } from './controllers/task-controller.js';
import { AgentRenderer } from './renderers/agent-renderer.js';
import { TaskRenderer } from './renderers/task-renderer.js';
import { UIManager } from './ui-manager.js';
import { TaskManager } from './task-manager.js';
import { CanvasManager } from './canvas-manager.js';
import { ConnectionLinesManager } from './connection-lines.js';

class App {
    constructor() {
        // State managers
        this.agentManager = new AgentManager();
        this.canvasManager = new CanvasManager('agentCanvas');
        this.taskManager = new TaskManager(this.canvasManager);
        
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
        
        // Connection lines
        this.connectionLines = new ConnectionLinesManager(this.canvasManager, this.taskManager);
        this.taskManager.connectionLines = this.connectionLines;
        this.canvasManager.connectionLines = this.connectionLines;
        
        // WebSocket service
        this.wsService = new WebSocketService('ws://localhost:8001/ws');
        
        this.init();
    }
    
    init() {
        // Set up connection state callback
        this.wsService.setConnectionStateCallback((connected) => {
            this.uiManager.setConnected(connected);
        });
        
        // Initialize WebSocket handlers
        this.setupWebSocketHandlers();
        
        // Initialize UI event handlers
        this.setupUIHandlers();
        
        // Connect to server
        this.wsService.connect();
    }
    
    setupWebSocketHandlers() {
        // Connection established
        this.wsService.on('connection_established', (data) => {
            if (data.data.agents) {
                const agentCount = data.data.agents.length;
                let maxTaskCount = 0;
                
                data.data.agents.forEach((agent, index) => {
                    if (!this.agentManager.getAgent(agent.id)) {
                        this.agentManager.addAgent(agent);
                        this.uiManager.renderAgent(agent);
                        
                        if (agent.tasklist && agent.tasklist.tasks) {
                            // Delay task creation to allow agent positioning to complete
                            // Agent positioning takes ~100ms (2 RAF + 50ms), add buffer
                            setTimeout(() => {
                                this.taskController.createTasksForAgent(agent.id, agent.tasklist);
                            }, 200);
                            maxTaskCount = Math.max(maxTaskCount, agent.tasklist.tasks.length);
                        }
                    }
                });
                
                // Scroll to first agent after loading
                if (agentCount > 0) {
                    const firstAgent = data.data.agents[0];
                    const scrollDelay = 800 + (maxTaskCount * 100) + 300;
                    setTimeout(() => {
                        this.canvasManager.scrollAgentToCenter(firstAgent.id);
                    }, scrollDelay);
                }
            }
            
            this.updateStats();
        });
        
        // Agent created
        this.wsService.on('agent_created', (data) => {
            console.log('[WebSocket] agent_created:', data);
            const agent = data.data;
            this.agentManager.addAgent(agent);
            this.uiManager.renderAgent(agent);
            this.updateStats();
        });
        
        // Agent updated
        this.wsService.on('agent_updated', (data) => {
            console.log('[WebSocket] agent_updated:', data);
            const agent = data.data;
            this.agentManager.updateAgent(agent.id, agent);
            this.uiManager.updateAgentFields(agent);
            this.updateStats();
        });
        
        // Agent started
        this.wsService.on('agent_started', (data) => {
            console.log('[WebSocket] agent_started:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                this.taskController.clearTasksForAgent(data.data.agent_id);
                this.updateStats();
            }
        });
        
        // Agent halted
        this.wsService.on('agent_halted', (data) => {
            console.log('[WebSocket] agent_halted:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'halted';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'halted');
                this.updateStats();
            }
        });
        
        // Agent continued
        this.wsService.on('agent_continued', (data) => {
            console.log('[WebSocket] agent_continued:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                this.scrollToFirstTask(data.data.agent_id);
                this.updateStats();
            }
        });
        
        // Workflow phase updates
        this.wsService.on('workflow_phase', (data) => {
            console.log('[WebSocket] workflow_phase:', data);
            const { agent_id, phase, status, content, tasklist } = data.data;
            
            this.uiManager.updateWorkflowPhase(agent_id, phase, status);
            
            if (status === 'active') {
                this.uiManager.clearAgentContent(agent_id);
            }
            
            if (status === 'completed' && content) {
                this.uiManager.updatePhaseContent(agent_id, phase, content, false);
                
                if (phase === 0 && tasklist) {
                    const agent = this.agentManager.getAgent(agent_id);
                    if (agent) {
                        agent.tasklist = tasklist;
                    }
                    this.taskController.createTasksForAgent(agent_id, tasklist);
                }
            }
        });
        
        // Task events
        this.wsService.on('task_running', (data) => {
            console.log('[WebSocket] task_running:', data);
            const { agent_id, task_id, status } = data.data;
            this.taskController.updateTaskStatus(agent_id, task_id, status);
            this.taskController.updateTaskContent(agent_id, task_id, '');
        });
        
        this.wsService.on('task_completed', (data) => {
            console.log('[WebSocket] task_completed:', data);
            const { agent_id, task_id, status, output, validation } = data.data;
            this.taskController.updateTaskStatus(agent_id, task_id, status);
            if (output) {
                this.taskController.updateTaskContent(agent_id, task_id, output, false);
            }
            
            // Show validation spinner if no validation data yet
            if (!validation) {
                this.taskController.showValidationLoading(agent_id, task_id);
            } else {
                // Show validation result immediately if included
                this.taskController.showValidation(
                    agent_id,
                    task_id,
                    validation.is_valid,
                    validation.reason,
                    validation.score
                );
            }
        });
        
        this.wsService.on('task_failed', (data) => {
            console.log('[WebSocket] task_failed:', data);
            const { agent_id, task_id, error } = data.data;
            this.taskController.updateTaskStatus(agent_id, task_id, 'failed');
            this.taskController.updateTaskContent(agent_id, task_id, `Error: ${error}`, false);
        });
        
        this.wsService.on('task_cancelled', (data) => {
            console.log('[WebSocket] task_cancelled:', data);
            const { agent_id, task_id } = data.data;
            this.taskController.updateTaskStatus(agent_id, task_id, 'cancelled');
        });
        
        this.wsService.on('task_chunk', (data) => {
            const { agent_id, task_id, chunk } = data.data;
            
            // Ensure task is in running state
            const taskKey = `${agent_id}-task-${task_id}`;
            const taskData = this.taskManager.getTask(taskKey);
            if (taskData) {
                const statusEl = taskData.element.querySelector('.task-node-status');
                if (statusEl && !statusEl.classList.contains('running')) {
                    this.taskController.updateTaskStatus(agent_id, task_id, 'running');
                }
            }
            
            this.taskController.updateTaskContent(agent_id, task_id, chunk, true);
        });
        
        this.wsService.on('task_validation', (data) => {
            console.log('[WebSocket] task_validation:', data);
            const { agent_id, task_id, is_valid, reason, score } = data.data;
            this.taskController.showValidation(agent_id, task_id, is_valid, reason, score || 0);
        });
        
        // Phase streaming chunks
        this.wsService.on('phase_chunk', (data) => {
            const { agent_id, phase, chunk } = data.data;
            this.uiManager.updatePhaseContent(agent_id, phase, chunk, true);
        });
        
        // Agent chunk
        this.wsService.on('agent_chunk', (data) => {
            this.uiManager.appendAgentChunk(data.data.agent_id, data.data.chunk);
        });
        
        // LLM action events
        this.wsService.on('action', (data) => {
            if (data.action && data.action.startsWith('llm_')) {
                this.logLLMAction(data);
            }
            
            if (data.action === 'llm_stream_start' && data.agent_id) {
                this.uiManager.startAgentStreaming(data.agent_id);
            }
        });
        
        // Agent completed
        this.wsService.on('agent_completed', (data) => {
            console.log('[WebSocket] agent_completed:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'completed';
                agent.article = data.data.article;
                agent.word_count = data.data.word_count;
                agent.generation_time = data.data.generation_time;
                
                this.uiManager.completeAgent(data.data.agent_id, {
                    article: data.data.article,
                    word_count: data.data.word_count,
                    generation_time: data.data.generation_time
                });
                
                this.updateStats();
            }
        });
        
        // Agent failed
        this.wsService.on('agent_failed', (data) => {
            console.log('[WebSocket] agent_failed:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'failed';
                agent.error = data.data.error;
                this.uiManager.showAgentError(data.data.agent_id, data.data.error);
                this.updateStats();
            }
        });
        
        // Agent stopped
        this.wsService.on('agent_stopped', (data) => {
            console.log('[WebSocket] agent_stopped:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'created';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'created');
                this.updateStats();
            }
        });
        
        // Agent deleted
        this.wsService.on('agent_deleted', (data) => {
            console.log('[WebSocket] agent_deleted:', data);
            this.agentManager.removeAgent(data.data.agent_id);
            this.uiManager.removeAgent(data.data.agent_id);
            this.taskController.removeTasksForAgent(data.data.agent_id);
            this.updateStats();
        });
        
        // Agents cleared
        this.wsService.on('agents_cleared', (data) => {
            const agents = this.agentManager.getAllAgents();
            agents.forEach(agent => {
                if (agent.status === 'completed' || agent.status === 'failed') {
                    this.agentManager.removeAgent(agent.id);
                    this.uiManager.removeAgent(agent.id);
                    this.taskController.removeTasksForAgent(agent.id);
                }
            });
            this.updateStats();
        });
    }
    
    setupUIHandlers() {
        // Add agent button
        document.getElementById('addAgentBtn').addEventListener('click', () => {
            this.uiManager.openCreateAgentModal();
        });
        
        // Clear completed button
        document.getElementById('clearCompletedBtn').addEventListener('click', async () => {
            await this.agentController.clearCompleted();
        });
        
        // Create agent submit
        document.getElementById('createAgentSubmit').addEventListener('click', async () => {
            await this.createAgent();
        });
        
        // Edit agent submit
        document.getElementById('editAgentSubmit').addEventListener('click', async () => {
            await this.editAgent();
        });
    }
    
    async createAgent() {
        const name = document.getElementById('agentName').value.trim();
        const context = document.getElementById('agentContext').value.trim();
        const temperature = parseFloat(document.getElementById('agentTemperature').value);
        
        try {
            await this.agentController.createAgent(name || null, context, temperature, false);
            
            // Close modal
            this.uiManager.closeCreateAgentModal();
            
            // Reset form
            document.getElementById('agentName').value = '';
            document.getElementById('agentContext').value = '';
            document.getElementById('agentTemperature').value = 0.3;
            document.getElementById('tempValue').textContent = '0.3';
            
        } catch (error) {
            console.error('[App] Failed to create agent:', error);
            alert(`Failed to create agent: ${error.message}`);
        }
    }
    
    async editAgent() {
        const agentId = document.getElementById('editAgentId').value;
        const name = document.getElementById('editAgentName').value.trim();
        const context = document.getElementById('editAgentContext').value.trim();
        const temperature = parseFloat(document.getElementById('editAgentTemperature').value);
        
        try {
            await this.agentController.updateAgent(agentId, {
                name: name || null,
                context,
                temperature
            });
            
            // Close modal
            this.uiManager.closeEditAgentModal();
            
        } catch (error) {
            console.error('[App] Failed to update agent:', error);
            alert(`Failed to update agent: ${error.message}`);
        }
    }
    
    updateStats() {
        const agents = this.agentManager.getAllAgents();
        const active = agents.filter(a => a.status === 'running').length;
        const completed = agents.filter(a => a.status === 'completed').length;
        const total = agents.length;
        
        document.getElementById('activeCount').textContent = active;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('totalCount').textContent = total;
    }
    
    scrollToFirstTask(agentId) {
        const firstTask = this.taskManager.getFirstTask(agentId);
        if (firstTask) {
            this.taskController.focusTask(agentId, firstTask.taskId);
        }
    }
    
    logLLMAction(data) {
        if (data.action.startsWith('llm_')) {
            console.group(`%c[LLM ${data.action}]`, 'color: #10b981; font-weight: bold;');
            
            if (data.action === 'llm_request') {
                console.log('%cREQUEST DETAILS:', 'color: #3b82f6; font-weight: bold;');
                console.log('Endpoint:', data.data?.endpoint);
                console.log('Model:', data.data?.model);
                console.log('Temperature:', data.data?.temperature);
                console.log('Max Tokens:', data.data?.max_tokens);
                console.log('Prompt (first 200 chars):', data.data?.prompt?.substring(0, 200) + '...');
                if (data.agent_id) console.log('Agent ID:', data.agent_id);
                if (data.task_id) console.log('Task ID:', data.task_id);
            } else if (data.action === 'llm_response') {
                console.log('%cRESPONSE DETAILS:', 'color: #10b981; font-weight: bold;');
                console.log('Success:', data.data?.success);
                console.log('Generation Time:', data.data?.generation_time?.toFixed(2) + 's');
                console.log('Response Length:', data.data?.response_length, 'characters');
                if (data.data?.error) console.error('Error:', data.data.error);
            }
            
            console.groupEnd();
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
