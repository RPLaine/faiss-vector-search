/**
 * UI Manager - Handles all UI updates with canvas-based agent nodes
 */

import { CanvasManager } from './canvas-manager.js';

export class UIManager {
    constructor() {
        this.agentNodes = new Map();
        this.canvasManager = new CanvasManager('agentCanvas');
    }
    
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
    
    renderAgent(agent) {
        const container = document.getElementById('agentNodesContainer');
        
        const node = document.createElement('div');
        node.className = 'agent-node';
        node.id = `agent-${agent.id}`;
        node.dataset.agentId = agent.id;
        
        node.innerHTML = `
            <div class="agent-node-header">
                <div class="agent-node-info">
                    <h3>${this.escapeHtml(agent.name)}</h3>
                    ${agent.context ? `<div class="agent-node-context">${this.escapeHtml(agent.context)}</div>` : ''}
                </div>
                <div class="agent-node-status ${agent.status}">${agent.status}</div>
            </div>
            <div class="agent-node-meta">
                <span>Temp: ${agent.temperature || 'N/A'}</span>
            </div>
            <div class="agent-node-controls">
                <button class="btn btn-primary btn-action" data-agent-id="${agent.id}" data-action="start">
                    <span class="btn-icon">▶️</span>
                    <span class="btn-text">Start</span>
                </button>
                <button class="btn btn-primary btn-continue" data-agent-id="${agent.id}" style="display: none;">
                    <span class="btn-icon">⏩</span>
                    Continue
                </button>
                <button class="btn btn-secondary btn-edit" data-agent-id="${agent.id}">
                    <span class="btn-icon">✏️</span>
                    Edit
                </button>
                <button class="btn btn-secondary btn-delete" data-agent-id="${agent.id}">
                    <span class="btn-icon">🗑️</span>
                    Delete
                </button>
                <label class="auto-control">
                    <input type="checkbox" class="auto-checkbox" data-agent-id="${agent.id}" ${agent.auto ? 'checked' : ''}>
                    Auto
                </label>
                <label class="auto-control halt-control" data-agent-id="${agent.id}">
                    <input type="checkbox" class="halt-checkbox" data-agent-id="${agent.id}" ${agent.halt ? 'checked' : ''}>
                    Halt
                </label>
                <label class="auto-control">
                    <input type="checkbox" class="expand-checkbox" data-agent-id="${agent.id}" ${agent.expanded ? 'checked' : ''}>
                    Expand
                </label>
            </div>
            <div class="agent-node-content ${agent.expanded ? 'expanded' : ''}" id="content-container-${agent.id}">
                <div class="content-text" id="content-${agent.id}">${agent.phase_0_response ? this.escapeHtml(agent.phase_0_response) : 'Waiting to start...'}</div>
            </div>
        `;
        
        container.appendChild(node);
        this.agentNodes.set(agent.id, node);
        
        // Position node at center using canvas manager
        this.canvasManager.addAgent(agent.id, node);
        
        // Add event listeners
        this.attachNodeEventListeners(node, agent.id);
        
        // Observe content area size changes to recalculate position
        this.observeContentChanges(agent.id, node);
    }
    
    observeContentChanges(agentId, node) {
        const contentContainer = node.querySelector(`#content-container-${agentId}`);
        if (!contentContainer) return;
        
        // Create ResizeObserver to watch for size changes
        const resizeObserver = new ResizeObserver(() => {
            // Recenter the agent when content size changes
            this.canvasManager.recenterAgent(agentId);
        });
        
        // Start observing
        resizeObserver.observe(contentContainer);
        
        // Store observer reference for cleanup
        if (!node._observers) {
            node._observers = [];
        }
        node._observers.push(resizeObserver);
    }
    
    attachNodeEventListeners(node, agentId) {
        // Action button (Start/Stop/Redo)
        const actionBtn = node.querySelector('.btn-action');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => this.handleActionButton(agentId));
        }
        
        // Continue button
        const continueBtn = node.querySelector('.btn-continue');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.handleContinueAgent(agentId));
        }
        
        // Edit button
        const editBtn = node.querySelector('.btn-edit');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.handleEditAgent(agentId));
        }
        
        // Delete button
        const deleteBtn = node.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.handleDeleteAgent(agentId));
        }
        
        // Auto checkbox
        const autoCheckbox = node.querySelector('.auto-checkbox');
        if (autoCheckbox) {
            autoCheckbox.addEventListener('change', (e) => this.handleAutoToggle(agentId, e.target.checked));
        }
        
        // Halt checkbox
        const haltCheckbox = node.querySelector('.halt-checkbox');
        if (haltCheckbox) {
            haltCheckbox.addEventListener('change', (e) => this.handleHaltToggle(agentId, e.target.checked));
        }
        
        // Expand checkbox
        const expandCheckbox = node.querySelector('.expand-checkbox');
        if (expandCheckbox) {
            expandCheckbox.addEventListener('change', (e) => this.handleExpandToggle(agentId, e.target.checked));
        }
    }
    
    async handleActionButton(agentId) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        const actionBtn = node.querySelector('.btn-action');
        if (!actionBtn) return;
        
        const action = actionBtn.dataset.action;
        
        if (action === 'start') {
            await this.handleStartAgent(agentId);
        } else if (action === 'stop') {
            await this.handleStopAgent(agentId);
        } else if (action === 'redo') {
            await this.handleRedoPhase(agentId);
        }
    }
    
    setActionButton(agentId, action, icon, text) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        const actionBtn = node.querySelector('.btn-action');
        if (!actionBtn) return;
        
        actionBtn.dataset.action = action;
        const iconSpan = actionBtn.querySelector('.btn-icon');
        const textSpan = actionBtn.querySelector('.btn-text');
        
        if (iconSpan) iconSpan.textContent = icon;
        if (textSpan) textSpan.textContent = text;
        
        // Update button style based on action
        if (action === 'stop') {
            actionBtn.classList.remove('btn-primary');
            actionBtn.classList.add('btn-danger');
        } else {
            actionBtn.classList.remove('btn-danger');
            actionBtn.classList.add('btn-primary');
        }
    }
    
    async handleStartAgent(agentId) {
        try {
            // Get halt and auto settings from checkboxes
            const node = this.agentNodes.get(agentId);
            const haltCheckbox = node?.querySelector('.halt-checkbox');
            const autoCheckbox = node?.querySelector('.auto-checkbox');
            const halt = haltCheckbox?.checked || false;
            const auto = autoCheckbox?.checked || false;
            
            // Update agent auto state in agent manager
            const agent = window.app.agentManager.getAgent(agentId);
            if (agent) {
                agent.auto = auto;
            }
            
            const response = await fetch(`/api/agents/${agentId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ halt })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log(`Agent ${agentId} started (halt: ${halt}, auto: ${auto})`);
            
            // Clear content for streaming
            this.clearAgentContent(agentId);
            
            // Change button to Stop
            this.setActionButton(agentId, 'stop', '⏹️', 'Stop');
        } catch (error) {
            console.error('Failed to start agent:', error);
            alert(`Failed to start agent: ${error.message}`);
        }
    }
    
    async handleStopAgent(agentId) {
        try {
            const response = await fetch(`/api/agents/${agentId}/stop`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log(`Agent ${agentId} stopped`);
        } catch (error) {
            console.error('Failed to stop agent:', error);
            alert(`Failed to stop agent: ${error.message}`);
        }
    }
    
    async handleRedoPhase(agentId) {
        try {
            const agent = window.app.agentManager.getAgent(agentId);
            const currentPhase = agent?.current_phase || 0;
            
            const response = await fetch(`/api/agents/${agentId}/redo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase: currentPhase })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log(`Agent ${agentId} redoing phase ${currentPhase}`);
            
            // Clear content for streaming
            this.clearAgentContent(agentId);
            
            // Change button back to Stop
            this.setActionButton(agentId, 'stop', '⏹️', 'Stop');
        } catch (error) {
            console.error('Failed to redo phase:', error);
            alert(`Failed to redo phase: ${error.message}`);
        }
    }
    
    async handleContinueAgent(agentId) {
        try {
            const response = await fetch(`/api/agents/${agentId}/continue`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log(`Agent ${agentId} continued`);
        } catch (error) {
            console.error('Failed to continue agent:', error);
            alert(`Failed to continue agent: ${error.message}`);
        }
    }
    
    handleEditAgent(agentId) {
        // Get agent data from agent manager
        const agent = window.app.agentManager.getAgent(agentId);
        if (!agent) {
            alert('Agent not found');
            return;
        }
        
        // Check if agent is running
        if (agent.status === 'running') {
            alert('Cannot edit a running agent. Please wait for it to complete or stop it first.');
            return;
        }
        
        // Populate edit modal with current agent data
        document.getElementById('editAgentId').value = agentId;
        document.getElementById('editAgentName').value = agent.name || '';
        document.getElementById('editAgentContext').value = agent.context || '';
        document.getElementById('editAgentTemperature').value = agent.temperature || 0.3;
        document.getElementById('editTempValue').textContent = agent.temperature || 0.3;
        
        // Open modal
        this.openEditAgentModal();
    }
    
    async handleDeleteAgent(agentId) {
        if (!confirm('Delete this agent?')) return;
        
        try {
            const response = await fetch(`/api/agents/${agentId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            console.log(`Agent ${agentId} deleted`);
        } catch (error) {
            console.error('Failed to delete agent:', error);
            alert(`Failed to delete agent: ${error.message}`);
        }
    }
    
    async handleAutoToggle(agentId, enabled) {
        // Update frontend agent state
        const agent = window.app.agentManager.getAgent(agentId);
        if (agent) {
            agent.auto = enabled;
        }
        
        // Update backend agent state (without broadcasting to avoid re-render)
        try {
            const response = await fetch(`/api/agents/${agentId}/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auto: enabled })
            });
            
            if (!response.ok) {
                console.warn(`Failed to update auto state on server: ${response.status}`);
            }
            
            console.log(`Agent ${agentId} auto:`, enabled);
        } catch (error) {
            console.error('Failed to update auto state:', error);
        }
    }
    
    async handleHaltToggle(agentId, enabled) {
        // Update frontend agent state
        const agent = window.app.agentManager.getAgent(agentId);
        if (agent) {
            agent.halt = enabled;
        }
        
        // Update backend agent state (for running agents)
        try {
            const response = await fetch(`/api/agents/${agentId}/halt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ halt: enabled })
            });
            
            if (!response.ok) {
                console.warn(`Failed to update halt state on server: ${response.status}`);
            }
            
            console.log(`Agent ${agentId} halt:`, enabled);
        } catch (error) {
            console.error('Failed to update halt state:', error);
        }
    }
    
    async handleExpandToggle(agentId, enabled) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        const contentContainer = node.querySelector(`#content-container-${agentId}`);
        if (contentContainer) {
            if (enabled) {
                contentContainer.classList.add('expanded');
            } else {
                contentContainer.classList.remove('expanded');
            }
        }
        
        // Wait for CSS transition to complete, then recenter
        setTimeout(() => {
            this.canvasManager.recenterAgent(agentId);
        }, 50);
        
        // Update frontend agent state
        const agent = window.app.agentManager.getAgent(agentId);
        if (agent) {
            agent.expanded = enabled;
        }
        
        // Update backend agent state (without broadcasting to avoid re-render)
        try {
            const response = await fetch(`/api/agents/${agentId}/expand`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expanded: enabled })
            });
            
            if (!response.ok) {
                console.warn(`Failed to update expand state on server: ${response.status}`);
            }
            
            console.log(`Agent ${agentId} expand:`, enabled);
        } catch (error) {
            console.error('Failed to update expand state:', error);
        }
    }
    
    updateAgentStatus(agentId, status) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        const statusEl = node.querySelector('.agent-node-status');
        
        // Map internal status to display text
        const displayStatus = status === 'halted' ? 'Phase Complete' : status;
        
        statusEl.className = `agent-node-status ${status}`;
        statusEl.textContent = displayStatus;
        
        // Update node border color
        node.className = `agent-node ${status}`;
        
        // Update action button, continue button, and halt checkbox visibility based on status
        const agent = window.app.agentManager.getAgent(agentId);
        const haltEnabled = agent?.halt || false;
        
        if (status === 'running') {
            // Show Stop button, hide Continue button, show Halt checkbox
            this.setActionButton(agentId, 'stop', '⏹️', 'Stop');
            this.hideButton(agentId, '.btn-continue');
            this.showControl(agentId, '.halt-control');
        } else if (status === 'halted') {
            // Show Redo button, show Continue button, hide Halt checkbox
            this.setActionButton(agentId, 'redo', '🔄', 'Redo');
            this.showButton(agentId, '.btn-continue');
            this.hideControl(agentId, '.halt-control');
        } else if (status === 'completed') {
            // Show Start button, hide Continue button, show Halt checkbox
            this.setActionButton(agentId, 'start', '▶️', 'Start');
            this.hideButton(agentId, '.btn-continue');
            this.showControl(agentId, '.halt-control');
        } else if (status === 'created') {
            // Show Start button, hide Continue button, show Halt checkbox
            this.setActionButton(agentId, 'start', '▶️', 'Start');
            this.hideButton(agentId, '.btn-continue');
            this.showControl(agentId, '.halt-control');
        } else if (status === 'failed') {
            // Show Start button, hide Continue button, show Halt checkbox
            this.setActionButton(agentId, 'start', '▶️', 'Start');
            this.hideButton(agentId, '.btn-continue');
            this.showControl(agentId, '.halt-control');
        }
    }
    
    showButton(agentId, selector) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        const btn = node.querySelector(selector);
        if (btn) btn.style.display = 'inline-flex';
    }
    
    hideButton(agentId, selector) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        const btn = node.querySelector(selector);
        if (btn) btn.style.display = 'none';
    }
    
    showControl(agentId, selector) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        const control = node.querySelector(selector);
        if (control) control.style.display = '';
    }
    
    hideControl(agentId, selector) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        const control = node.querySelector(selector);
        if (control) control.style.display = 'none';
    }
    
    updateWorkflowPhase(agentId, phaseIndex, status = 'active') {
        // Log phase updates for debugging
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
    
    updatePhaseContent(agentId, phaseIndex, content, append = false) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        const contentText = node.querySelector(`#content-${agentId}`);
        if (!contentText) return;
        
        if (append) {
            // During streaming, append chunks
            contentText.textContent += content;
        } else {
            // Non-streaming update - set content directly
            contentText.textContent = content;
        }
        
        // Auto-scroll to bottom
        contentText.scrollTop = contentText.scrollHeight;
        
        console.log(`Agent ${agentId} - Phase ${phaseIndex} content update`);
    }
    
    _renderTasklist(container, content) {
        // Try to parse as JSON tasklist
        try {
            // Extract JSON if wrapped in code blocks
            let jsonText = content;
            if (content.includes('```json')) {
                const start = content.indexOf('```json') + 7;
                const end = content.indexOf('```', start);
                jsonText = content.substring(start, end).trim();
            } else if (content.includes('```')) {
                const start = content.indexOf('```') + 3;
                const end = content.indexOf('```', start);
                jsonText = content.substring(start, end).trim();
            }
            
            const tasklist = JSON.parse(jsonText);
            
            // Render as formatted tasklist
            let html = `<div class="tasklist">`;
            html += `<div class="tasklist-goal"><strong>Goal:</strong> ${this.escapeHtml(tasklist.goal)}</div>`;
            html += `<div class="tasklist-header">${tasklist.tasks.length} Tasks:</div>`;
            html += `<ol class="tasklist-items">`;
            
            tasklist.tasks.forEach(task => {
                html += `<li class="task-item">`;
                html += `<div class="task-name">${this.escapeHtml(task.name)}</div>`;
                html += `<div class="task-description">${this.escapeHtml(task.description)}</div>`;
                if (task.expected_output) {
                    html += `<div class="task-output"><em>Expected: ${this.escapeHtml(task.expected_output)}</em></div>`;
                }
                html += `</li>`;
            });
            
            html += `</ol></div>`;
            container.innerHTML = html;
            
        } catch (e) {
            // Not valid JSON, render as plain text
            container.textContent = content;
        }
    }
    
    completeWorkflow(agentId) {
        // Placeholder for future workflow visualization
        console.log(`Agent ${agentId} - Workflow completed`);
    }
    
    startAgentStreaming(agentId) {
        // Not needed with new simple layout
    }
    
    appendAgentChunk(agentId, chunk) {
        // Placeholder - could show progress indicator
        console.log(`Agent ${agentId} - Chunk received`);
    }
    
    completeAgent(agentId, data) {
        this.updateAgentStatus(agentId, 'completed');
        console.log(`Agent ${agentId} completed:`, data);
    }
    
    clearAgentContent(agentId) {
        const contentDiv = document.getElementById(`content-${agentId}`);
        if (contentDiv) {
            contentDiv.textContent = '';
        }
    }
    
    showAgentError(agentId, error) {
        const node = this.agentNodes.get(agentId);
        if (!node) return;
        
        this.updateAgentStatus(agentId, 'failed');
        
        // Show error message in node
        const meta = node.querySelector('.agent-node-meta');
        if (meta) {
            const errorDiv = document.createElement('div');
            errorDiv.style.color = 'var(--color-accent-danger)';
            errorDiv.style.fontSize = '11px';
            errorDiv.style.marginTop = 'var(--space-sm)';
            errorDiv.textContent = `Error: ${error}`;
            meta.appendChild(errorDiv);
        }
    }
    
    removeAgent(agentId) {
        const node = this.agentNodes.get(agentId);
        if (node) {
            // Disconnect observers before removing
            if (node._observers) {
                node._observers.forEach(observer => observer.disconnect());
            }
            
            node.style.opacity = '0';
            node.style.transform = 'scale(0.9)';
            setTimeout(() => {
                node.remove();
                this.agentNodes.delete(agentId);
                this.canvasManager.removeAgent(agentId);
            }, 300);
        }
    }
    
    openCreateAgentModal() {
        document.getElementById('createAgentModal').classList.add('active');
        document.getElementById('agentName').focus();
    }
    
    closeCreateAgentModal() {
        document.getElementById('createAgentModal').classList.remove('active');
    }
    
    openEditAgentModal() {
        document.getElementById('editAgentModal').classList.add('active');
        document.getElementById('editAgentName').focus();
    }
    
    closeEditAgentModal() {
        document.getElementById('editAgentModal').classList.remove('active');
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
