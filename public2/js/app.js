/**
 * AI Journalist Agents Demo - Main Application
 */

import { WebSocketService } from './websocket.js';
import { AgentManager } from './agent-manager.js';
import { UIManager } from './ui-manager.js';

class App {
    constructor() {
        this.wsService = new WebSocketService('ws://localhost:8001/ws');
        this.agentManager = new AgentManager();
        this.uiManager = new UIManager();
        
        this.init();
    }
    
    init() {
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
            this.uiManager.setConnected(true);
            
            // Load existing agents
            if (data.data.agents) {
                data.data.agents.forEach(agent => {
                    this.agentManager.addAgent(agent);
                    this.uiManager.renderAgent(agent);
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
            
            // Re-render the agent node with updated data
            this.uiManager.removeAgent(agent.id);
            setTimeout(() => {
                this.uiManager.renderAgent(agent);
                this.updateStats();
            }, 350);
        });
        
        // Agent started
        this.wsService.on('agent_started', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                this.updateStats();
            }
        });
        
        // Agent halted
        this.wsService.on('agent_halted', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'halted';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'halted');
                this.updateStats();
            }
        });
        
        // Agent continued
        this.wsService.on('agent_continued', (data) => {
            const agent = this.agentManager.getAgent(data.data.agent_id);
            if (agent) {
                agent.status = 'running';
                this.uiManager.updateAgentStatus(data.data.agent_id, 'running');
                this.updateStats();
            }
        });
        
        // Workflow phase updates
        this.wsService.on('workflow_phase', (data) => {
            const { agent_id, phase, status, content } = data.data;
            // phase: 0-6 (index), status: 'active' or 'completed'
            this.uiManager.updateWorkflowPhase(agent_id, phase, status);
            
            // Clear content and show initial message when phase becomes active (before streaming)
            if (status === 'active' && content) {
                this.uiManager.clearAgentContent(agent_id);
                this.uiManager.updatePhaseContent(agent_id, phase, content, false);
            }
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
    }
    
    async createAgent() {
        const name = document.getElementById('agentName').value.trim();
        const context = document.getElementById('agentContext').value.trim();
        const style = document.getElementById('agentStyle').value;
        const temperature = parseFloat(document.getElementById('agentTemperature').value);
        
        // Name is optional - backend will default to "Journalist" if not provided
        
        try {
            // Create agent
            const response = await fetch('/api/agents/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || null, context, style, temperature })
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
    
    updateStats() {
        const agents = this.agentManager.getAllAgents();
        const active = agents.filter(a => a.status === 'running').length;
        const completed = agents.filter(a => a.status === 'completed').length;
        const total = agents.length;
        
        document.getElementById('activeCount').textContent = active;
        document.getElementById('completedCount').textContent = completed;
        document.getElementById('totalCount').textContent = total;
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
