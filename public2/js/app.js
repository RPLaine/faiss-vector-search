/**
 * AI Journalist Agents Demo - Main Application
 */

import { WebSocketService } from './websocket.js';
import { AgentManager } from './agent-manager.js';
import { UIManager } from './ui-manager.js';
import { TaskManager } from './task-manager.js';

class App {
    constructor() {
        this.wsService = new WebSocketService('ws://localhost:8001/ws');
        this.agentManager = new AgentManager();
        this.uiManager = new UIManager();
        this.taskManager = null;  // Will be initialized when UIManager is ready
        
        this.init();
    }
    
    init() {
        // Set up connection state callback
        this.wsService.setConnectionStateCallback((connected) => {
            this.uiManager.setConnected(connected);
        });
        
        // Initialize task manager after UI manager
        this.taskManager = new TaskManager(this.uiManager.canvasManager);
        
        // Link task manager to UI manager for repositioning
        this.uiManager.taskManager = this.taskManager;
        
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
            // Load existing agents (only if not already rendered)
            if (data.data.agents) {
                data.data.agents.forEach(agent => {
                    // Only add and render if agent doesn't already exist
                    if (!this.agentManager.getAgent(agent.id)) {
                        this.agentManager.addAgent(agent);
                        this.uiManager.renderAgent(agent);
                        
                        // If agent has a tasklist, create task nodes
                        if (agent.tasklist && agent.tasklist.tasks) {
                            this.taskManager.createTasksForAgent(agent.id, agent.tasklist);
                        }
                    }
                });
            }
            
            this.updateStats();
        });
        
        // Agent created
        this.wsService.on('agent_created', (data) => {
            const agent = data.data;
            this.agentManager.addAgent(agent);
            this.uiManager.renderAgent(agent);
            this.updateStats();
        });
        
        // Agent updated
        this.wsService.on('agent_updated', (data) => {
            const agent = data.data;
            this.agentManager.updateAgent(agent.id, agent);
            
            // Update the agent node without removing it (smoother update)
            this.uiManager.updateAgentFields(agent);
            this.updateStats();
        });
        
        // Agent started
        this.wsService.on('agent_started', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                
                // Clear existing tasks with smooth animation
                this.taskManager.clearTasksForAgent(data.data.agent_id);
                
                this.updateStats();
            }
        });
        
        // Agent halted
        this.wsService.on('agent_halted', (data) => {
            console.log('Received agent_halted event:', data);
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                console.log('Updating agent status to halted');
                agent.status = 'halted';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'halted');
                this.updateStats();
            } else {
                console.warn('Agent not found in manager:', data.data.agent_id);
            }
        });
        
        // Agent continued
        this.wsService.on('agent_continued', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                
                // Scroll to first task if tasks exist
                this.scrollToFirstTask(data.data.agent_id);
                
                this.updateStats();
            }
        });
        
        // Workflow phase updates
        this.wsService.on('workflow_phase', (data) => {
            const { agent_id, phase, status, content, tasklist } = data.data;
            // phase: 0-6 (index), status: 'active' or 'completed'
            this.uiManager.updateWorkflowPhase(agent_id, phase, status);
            
            // Clear content when phase becomes active (before streaming starts)
            if (status === 'active') {
                this.uiManager.clearAgentContent(agent_id);
            }
            
            // Show final content when phase completes
            if (status === 'completed' && content) {
                this.uiManager.updatePhaseContent(agent_id, phase, content, false);
                
                // If phase 0 completed, create task nodes
                if (phase === 0 && tasklist) {
                    // Update agent with tasklist
                    const agent = this.agentManager.getAgent(agent_id);
                    if (agent) {
                        agent.tasklist = tasklist;
                    }
                    
                    // Create task nodes
                    this.taskManager.createTasksForAgent(agent_id, tasklist);
                }
            }
        });
        
        // Task events
        this.wsService.on('task_running', (data) => {
            const { agent_id, task_id, status } = data.data;
            this.taskManager.updateTaskStatus(agent_id, task_id, status);
            this.taskManager.updateTaskContent(agent_id, task_id, '');
        });
        
        this.wsService.on('task_completed', (data) => {
            const { agent_id, task_id, status, output, validation } = data.data;
            this.taskManager.updateTaskStatus(agent_id, task_id, status);
            if (output) {
                this.taskManager.updateTaskContent(agent_id, task_id, output, false);
            }
            if (validation) {
                this.taskManager.showValidation(
                    agent_id, 
                    task_id, 
                    validation.is_valid, 
                    validation.reason, 
                    validation.score
                );
            }
        });
        
        this.wsService.on('task_failed', (data) => {
            const { agent_id, task_id, error } = data.data;
            this.taskManager.updateTaskStatus(agent_id, task_id, 'failed');
            this.taskManager.updateTaskContent(agent_id, task_id, `Error: ${error}`, false);
        });
        
        this.wsService.on('task_cancelled', (data) => {
            const { agent_id, task_id } = data.data;
            this.taskManager.updateTaskStatus(agent_id, task_id, 'cancelled');
        });
        
        this.wsService.on('task_chunk', (data) => {
            const { agent_id, task_id, chunk } = data.data;
            this.taskManager.updateTaskContent(agent_id, task_id, chunk, true);
        });
        
        this.wsService.on('task_validation', (data) => {
            const { agent_id, task_id, is_valid, reason, score } = data.data;
            // Show validation immediately when received
            this.taskManager.showValidation(
                agent_id,
                task_id,
                is_valid,
                reason,
                score || 0
            );
            console.log(`Task ${task_id} validation: ${is_valid} (score: ${score}) - ${reason}`);
        });
        
        // Phase streaming chunks (for phase 0-5)
        this.wsService.on('phase_chunk', (data) => {
            const { agent_id, phase, chunk } = data.data;
            this.uiManager.updatePhaseContent(agent_id, phase, chunk, true);
        });
        
        // Agent streaming chunk
        this.wsService.on('agent_chunk', (data) => {
            this.uiManager.appendAgentChunk(data.data.agent_id, data.data.chunk);
        });
        
        // LLM stream start (with agent_id)
        this.wsService.on('action', (data) => {
            if (data.action === 'llm_stream_start' && data.agent_id) {
                this.uiManager.startAgentStreaming(data.agent_id);
            }
        });
        
        // Agent completed
        this.wsService.on('agent_completed', (data) => {
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
        
        // Agent auto-restart
        this.wsService.on('agent_auto_restart', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                
                // Clear content to show it's restarting
                this.uiManager.clearAgentContent(data.data.agent_id);
                
                this.updateStats();
            }
        });
        
        // Agent failed
        this.wsService.on('agent_failed', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'failed';
                agent.error = data.data.error;
                
                this.uiManager.updateAgentStatus(data.data.agent_id, 'failed');
                this.uiManager.showAgentError(data.data.agent_id, data.data.error);
                
                this.updateStats();
            }
        });
        
        // Agent stopped
        this.wsService.on('agent_stopped', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'created';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'created');
                this.updateStats();
            }
        });
        
        // Agent redo
        this.wsService.on('agent_redo', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                this.uiManager.clearAgentContent(data.data.agent_id);
                this.updateStats();
            }
        });
        
        // Agent deleted
        this.wsService.on('agent_deleted', (data) => {
            this.agentManager.removeAgent(data.data.agent_id);
            this.uiManager.removeAgent(data.data.agent_id);
            this.taskManager.removeTasksForAgent(data.data.agent_id);
            this.updateStats();
        });
        
        // Agents cleared
        this.wsService.on('agents_cleared', (data) => {
            // Remove completed/failed agents
            const agents = this.agentManager.getAllAgents();
            agents.forEach(agent => {
                if (agent.status === 'completed' || agent.status === 'failed') {
                    this.agentManager.removeAgent(agent.id);
                    this.uiManager.removeAgent(agent.id);
                    this.taskManager.removeTasksForAgent(agent.id);
                }
            });
            this.updateStats();
        });
        
        // Server online notification
        this.wsService.on('server_online', (data) => {
            console.log('Server restarted:', data.data.message);
            // Optionally show a visual notification to the user
            // that the server has restarted
        });
        
        // Server offline notification
        this.wsService.on('server_offline', (data) => {
            console.log('Server shutting down:', data.data.message);
        });
    }
    
    setupUIHandlers() {
        // Add agent button
        document.getElementById('addAgentBtn').addEventListener('click', () => {
            this.uiManager.openCreateAgentModal();
        });
        
        // Clear completed button
        document.getElementById('clearCompletedBtn').addEventListener('click', async () => {
            await this.clearCompleted();
        });
        
        // Create agent submit
        document.getElementById('createAgentSubmit').addEventListener('click', async () => {
            await this.createAgent();
        });
        
        // Edit agent submit
        document.getElementById('editAgentSubmit').addEventListener('click', async () => {
            await this.editAgent();
        });
        
        // Event delegation for task controls (Continue, Pause)
        const nodesContainer = document.getElementById('agentNodesContainer');
        
        nodesContainer.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            
            // Task Continue button
            if (target.classList.contains('task-continue-btn')) {
                const agentId = target.dataset.agentId;
                const taskId = parseInt(target.dataset.taskId);
                await this.continueTask(agentId, taskId);
            }
            
            // Task Pause button
            if (target.classList.contains('task-pause-btn')) {
                const agentId = target.dataset.agentId;
                const taskId = parseInt(target.dataset.taskId);
                await this.pauseTask(agentId, taskId);
            }
        });
    }
    
    async createAgent() {
        const name = document.getElementById('agentName').value.trim();
        const context = document.getElementById('agentContext').value.trim();
        const temperature = parseFloat(document.getElementById('agentTemperature').value);
        
        // Name is optional - backend will default to "Journalist" if not provided
        
        try {
            // Create agent
            const response = await fetch('/api/agents/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || null, context, temperature })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const agent = await response.json();
            
            // Close modal
            this.uiManager.closeCreateAgentModal();
            
            // Reset form
            document.getElementById('agentName').value = '';
            document.getElementById('agentContext').value = '';
            document.getElementById('agentTemperature').value = 0.3;
            document.getElementById('tempValue').textContent = '0.3';
            
        } catch (error) {
            console.error('Failed to create agent:', error);
            alert(`Failed to create agent: ${error.message}`);
        }
    }
    
    async editAgent() {
        const agentId = document.getElementById('editAgentId').value;
        const name = document.getElementById('editAgentName').value.trim();
        const context = document.getElementById('editAgentContext').value.trim();
        const temperature = parseFloat(document.getElementById('editAgentTemperature').value);
        
        try {
            // Update agent
            const response = await fetch(`/api/agents/${agentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || null, context, temperature })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const updatedAgent = await response.json();
            
            // Close modal
            this.uiManager.closeEditAgentModal();
            
            console.log('Agent updated:', updatedAgent);
            
        } catch (error) {
            console.error('Failed to update agent:', error);
            alert(`Failed to update agent: ${error.message}`);
        }
    }
    
    async clearCompleted() {
        try {
            const response = await fetch('/api/agents/clear', {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.error('Failed to clear agents:', error);
        }
    }
    
    async continueTask(agentId, taskId) {
        console.log(`Continue task ${taskId} for agent ${agentId}`);
        // Task execution is automatic - this would be for manual continuation if needed
        // For now, just focus on the next task
        const taskKeys = this.taskManager.agentTasks.get(agentId);
        if (taskKeys) {
            const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
                const taskA = this.taskManager.taskNodes.get(a);
                const taskB = this.taskManager.taskNodes.get(b);
                return taskA.taskId - taskB.taskId;
            });
            
            const currentIndex = sortedTaskKeys.findIndex(key => {
                const task = this.taskManager.taskNodes.get(key);
                return task.taskId === taskId;
            });
            
            if (currentIndex >= 0 && currentIndex < sortedTaskKeys.length - 1) {
                const nextTaskKey = sortedTaskKeys[currentIndex + 1];
                const nextTask = this.taskManager.taskNodes.get(nextTaskKey);
                if (nextTask) {
                    this.taskManager.focusTask(agentId, nextTask.taskId);
                }
            }
        }
    }
    
    async pauseTask(agentId, taskId) {
        console.log(`Pause task ${taskId} for agent ${agentId}`);
        // Pausing individual tasks not implemented yet
        alert('Task pause functionality coming soon');
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
        // Get the first task node for this agent
        const taskKeys = this.taskManager.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) {
            console.log(`No tasks found for agent ${agentId}`);
            return;
        }
        
        // Find the task with the smallest ID
        let firstTaskKey = null;
        let minTaskId = Infinity;
        
        for (const taskKey of taskKeys) {
            const taskData = this.taskManager.taskNodes.get(taskKey);
            if (taskData && taskData.taskId < minTaskId) {
                minTaskId = taskData.taskId;
                firstTaskKey = taskKey;
            }
        }
        
        if (firstTaskKey) {
            const taskData = this.taskManager.taskNodes.get(firstTaskKey);
            if (taskData && taskData.element) {
                // Scroll the element into view with smooth behavior
                taskData.element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center'
                });
                
                // Optional: Add a highlight effect
                taskData.element.style.boxShadow = '0 0 20px rgba(37, 99, 235, 0.6)';
                setTimeout(() => {
                    taskData.element.style.boxShadow = '';
                }, 2000);
                
                console.log(`Scrolled to first task (ID: ${minTaskId}) for agent ${agentId}`);
            }
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

// Global functions for modal
window.closeCreateAgentModal = () => {
    document.getElementById('createAgentModal').classList.remove('active');
};

window.closeEditAgentModal = () => {
    document.getElementById('editAgentModal').classList.remove('active');
};
