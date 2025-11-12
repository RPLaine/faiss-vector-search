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
        
        // Agent started
        this.wsService.on('agent_started', (data) => {
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
            
            // Update phase content if provided
            if (content) {
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
    }
    
    async createAgent() {
        const name = document.getElementById('agentName').value.trim();
        const context = document.getElementById('agentContext').value.trim();
        const style = document.getElementById('agentStyle').value;
        const temperature = parseFloat(document.getElementById('agentTemperature').value);
        
        if (!name) {
            alert('Please provide an agent name');
            return;
        }
        
        try {
            // Create agent
            const response = await fetch('/api/agents/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, context, style, temperature })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            const agent = await response.json();
            
            // Start agent immediately
            await fetch(`/api/agents/${agent.id}/start`, {
                method: 'POST'
            });
            
            // Close modal
            this.uiManager.closeCreateAgentModal();
            
            // Reset form
            document.getElementById('agentName').value = '';
            document.getElementById('agentContext').value = '';
            document.getElementById('agentStyle').value = 'professional journalism';
            document.getElementById('agentTemperature').value = '0.3';
            document.getElementById('tempValue').textContent = '0.3';
            
        } catch (error) {
            console.error('Failed to create agent:', error);
            alert(`Failed to create agent: ${error.message}`);
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
        
        // Show/hide empty state
        const emptyState = document.getElementById('emptyState');
        if (total === 0) {
            emptyState.classList.add('visible');
        } else {
            emptyState.classList.remove('visible');
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
