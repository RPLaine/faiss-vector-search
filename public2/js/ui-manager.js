/**
 * UI Manager - Handles all UI updates with phase node layout
 */

export class UIManager {
    constructor() {
        this.agentCards = new Map();
        this.phaseNodes = new Map(); // Store phase nodes by agent_id -> Map<phase_index, element>
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
        const grid = document.getElementById('agentsGrid');
        
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.id = `agent-${agent.id}`;
        card.dataset.agentId = agent.id;
        
        const phases = [
            { index: 0, icon: '💡', title: 'Invent Subject', subtitle: 'Phase 1', placeholder: 'Waiting to generate topic...' },
            { index: 1, icon: '📚', title: 'Get Sources', subtitle: 'Phase 2', placeholder: 'Waiting to search sources...' },
            { index: 2, icon: '🔍', title: 'Extract Data', subtitle: 'Phase 3', placeholder: 'Waiting to analyze data...' },
            { index: 3, icon: '👤', title: 'Find Names', subtitle: 'Phase 4', placeholder: 'Waiting to identify people...' },
            { index: 4, icon: '📤', title: 'Send Contacts', subtitle: 'Phase 5', placeholder: 'Waiting to send contacts...' },
            { index: 5, icon: '📥', title: 'Receive Info', subtitle: 'Phase 6', placeholder: 'Waiting to receive responses...' },
            { index: 6, icon: '✍️', title: 'Write Article', subtitle: 'Phase 7', placeholder: 'Waiting to write article...' }
        ];
        
        const phaseNodesHTML = phases.map(phase => `
            <div class="phase-node pending" id="phase-${agent.id}-${phase.index}" data-phase="${phase.index}">
                <div class="phase-node-header">
                    <div class="phase-node-icon">${phase.icon}</div>
                    <div class="phase-node-info">
                        <div class="phase-node-title">${phase.title}</div>
                        <div class="phase-node-subtitle">${phase.subtitle}</div>
                    </div>
                </div>
                <div class="phase-node-content">${phase.placeholder}</div>
            </div>
        `).join('');
        
        card.innerHTML = `
            <div class="agent-header">
                <div class="agent-info">
                    <h3>${this.escapeHtml(agent.name)}</h3>
                    ${agent.context ? `<div class="agent-topic">Context: ${this.escapeHtml(agent.context)}</div>` : '<div class="agent-topic">Autonomous journalist agent</div>'}
                </div>
                <div class="agent-status ${agent.status}">${agent.status}</div>
            </div>
            <div class="workflow-track">
                ${phaseNodesHTML}
            </div>
            <div class="agent-meta">
                <div class="agent-stats-meta">
                    <span class="meta-item">Style: ${this.escapeHtml(agent.style || 'N/A')}</span>
                    <span class="meta-item">Temp: ${agent.temperature || 'N/A'}</span>
                    <span class="meta-item words" style="display: none;">Words: <span class="word-count">0</span></span>
                    <span class="meta-item time" style="display: none;">Time: <span class="gen-time">0</span>s</span>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-small btn-secondary" onclick="deleteAgent('${agent.id}')">Delete</button>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
        this.agentCards.set(agent.id, card);
        
        // Store phase node references
        const phaseNodeMap = new Map();
        phases.forEach(phase => {
            const node = card.querySelector(`#phase-${agent.id}-${phase.index}`);
            if (node) {
                phaseNodeMap.set(phase.index, node);
            }
        });
        this.phaseNodes.set(agent.id, phaseNodeMap);
    }
    
    updateAgentStatus(agentId, status) {
        const card = this.agentCards.get(agentId);
        if (!card) return;
        
        const statusEl = card.querySelector('.agent-status');
        statusEl.className = `agent-status ${status}`;
        statusEl.textContent = status;
        
        // Update card border color
        card.className = `agent-card ${status}`;
    }
    
    updateWorkflowPhase(agentId, phaseIndex, status = 'active') {
        const phaseNodeMap = this.phaseNodes.get(agentId);
        if (!phaseNodeMap) return;
        
        const node = phaseNodeMap.get(phaseIndex);
        if (!node) return;
        
        // Update node status
        node.className = `phase-node ${status}`;
        
        // Mark previous phases as completed
        if (status === 'active') {
            for (let i = 0; i < phaseIndex; i++) {
                const prevNode = phaseNodeMap.get(i);
                if (prevNode && !prevNode.classList.contains('completed')) {
                    prevNode.className = 'phase-node completed';
                }
            }
            
            // Scroll to active node
            node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }
    
    updatePhaseContent(agentId, phaseIndex, content, append = false) {
        const phaseNodeMap = this.phaseNodes.get(agentId);
        if (!phaseNodeMap) return;
        
        const node = phaseNodeMap.get(phaseIndex);
        if (!node) return;
        
        const contentEl = node.querySelector('.phase-node-content');
        if (!contentEl) return;
        
        if (append) {
            // Store markdown for phase 6 (Write Article)
            if (phaseIndex === 6) {
                const currentMarkdown = contentEl.dataset.markdown || '';
                const newMarkdown = currentMarkdown + content;
                contentEl.dataset.markdown = newMarkdown;
                
                // Render markdown
                if (typeof marked !== 'undefined' && marked.parse) {
                    contentEl.innerHTML = marked.parse(newMarkdown);
                } else {
                    contentEl.textContent = newMarkdown;
                }
            } else {
                contentEl.textContent += content;
            }
        } else {
            contentEl.textContent = content;
        }
        
        // Auto-scroll content
        contentEl.scrollTop = contentEl.scrollHeight;
    }
    
    completeWorkflow(agentId) {
        const phaseNodeMap = this.phaseNodes.get(agentId);
        if (!phaseNodeMap) return;
        
        // Mark all phases as completed
        phaseNodeMap.forEach(node => {
            node.className = 'phase-node completed';
        });
    }
    
    startAgentStreaming(agentId) {
        // Not needed with new layout
    }
    
    appendAgentChunk(agentId, chunk) {
        // Stream to phase 6 (Write Article)
        this.updatePhaseContent(agentId, 6, chunk, true);
    }
    
    completeAgent(agentId, data) {
        const card = this.agentCards.get(agentId);
        if (!card) return;
        
        // Update article in phase 6 if not streamed
        if (data.article) {
            const phaseNodeMap = this.phaseNodes.get(agentId);
            if (phaseNodeMap) {
                const node = phaseNodeMap.get(6);
                if (node) {
                    const contentEl = node.querySelector('.phase-node-content');
                    if (contentEl) {
                        contentEl.dataset.markdown = data.article;
                        if (typeof marked !== 'undefined' && marked.parse) {
                            contentEl.innerHTML = marked.parse(data.article);
                        } else {
                            contentEl.textContent = data.article;
                        }
                    }
                }
            }
        }
        
        // Show metadata
        if (data.word_count) {
            const wordsEl = card.querySelector('.meta-item.words');
            const wordCount = card.querySelector('.word-count');
            if (wordsEl && wordCount) {
                wordsEl.style.display = 'inline';
                wordCount.textContent = data.word_count;
            }
        }
        
        if (data.generation_time) {
            const timeEl = card.querySelector('.meta-item.time');
            const genTime = card.querySelector('.gen-time');
            if (timeEl && genTime) {
                timeEl.style.display = 'inline';
                genTime.textContent = data.generation_time.toFixed(2);
            }
        }
        
        // Update status
        this.updateAgentStatus(agentId, 'completed');
        
        // Complete workflow
        this.completeWorkflow(agentId);
    }
    
    showAgentError(agentId, error) {
        const phaseNodeMap = this.phaseNodes.get(agentId);
        if (!phaseNodeMap) return;
        
        // Show error in all active/pending phases
        phaseNodeMap.forEach((node, index) => {
            if (!node.classList.contains('completed')) {
                const contentEl = node.querySelector('.phase-node-content');
                if (contentEl) {
                    contentEl.innerHTML = `<div style="color: var(--color-accent-danger);">Error: ${this.escapeHtml(error)}</div>`;
                }
            }
        });
    }
    
    removeAgent(agentId) {
        const card = this.agentCards.get(agentId);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                card.remove();
                this.agentCards.delete(agentId);
                this.phaseNodes.delete(agentId);
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
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global function for delete button
window.deleteAgent = async (agentId) => {
    if (!confirm('Delete this agent?')) return;
    
    try {
        const response = await fetch(`/api/agents/${agentId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to delete agent:', error);
        alert(`Failed to delete agent: ${error.message}`);
    }
};
