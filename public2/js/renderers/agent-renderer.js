/**
 * Agent Renderer - Pure agent DOM rendering
 * 
 * Responsibilities:
 * - Create agent DOM elements (no controls - controls are in centralized panel)
 * - Update agent UI elements
 * - NO business logic
 * - NO API calls
 * - NO state management
 * - NO control button management (handled by ControlPanelManager)
 */

import { MarkdownFormatter } from '../utils/markdown-formatter.js';
import { DOMUtils } from '../utils/dom-utils.js';
import { AnimationUtils } from '../utils/animation-utils.js';
import { ANIMATION_DURATIONS } from '../constants.js';

export class AgentRenderer {
    constructor(containerSelector, languageService = null) {
        this.container = document.querySelector(containerSelector);
        this.lang = languageService;
    }
    
    /**
     * Render an agent node
     */
    renderAgent(agent, eventHandlers = {}) {
        const node = DOMUtils.createElement('div', {
            className: `agent-node card-base ${agent.status || 'created'} initial-animation`,
            id: `agent-${agent.id}`,
            dataset: { agentId: agent.id }
        });
        
        node.innerHTML = this._getAgentTemplate(agent);
        
        this.container.appendChild(node);
        
        // Remove animation class after animation completes
        setTimeout(() => {
            node.classList.remove('initial-animation');
        }, ANIMATION_DURATIONS.AGENT_INITIAL_ANIMATION);
        
        // Attach event listeners if provided
        if (eventHandlers) {
            this._attachEventListeners(node, agent.id, eventHandlers);
        }
        
        // Add click handler for selection if provided
        if (eventHandlers.onSelect) {
            node.addEventListener('click', (e) => {
                // Don't trigger selection if clicking on interactive elements
                if (!e.target.closest('button, input, label')) {
                    eventHandlers.onSelect(agent.id);
                }
            });
        }
        
        return node;
    }
    
    /**
     * Get agent HTML template
     */
    _getAgentTemplate(agent) {
        const tempLabel = this.lang ? this.lang.t('agent.temperature', { value: agent.temperature || 'N/A' }) : `Temp: ${agent.temperature || 'N/A'}`;
        const waitingText = this.lang ? this.lang.t('agent.waiting') : 'Waiting to start...';
        const statusText = this._getStatusText(agent.status);
        
        return `
            <div class="agent-node-header">
                <div class="agent-node-info">
                    <h3>${MarkdownFormatter.escapeHtml(agent.name)}</h3>
                    ${agent.context ? `<div class="agent-node-context">${MarkdownFormatter.escapeHtml(agent.context)}</div>` : ''}
                </div>
                <div class="agent-node-status status-badge ${agent.status}">${statusText}</div>
            </div>
            <div class="agent-node-meta">
                <span>${tempLabel}</span>
            </div>
            <div class="agent-node-content content-container ${agent.expanded ? 'expanded' : ''}" id="content-container-${agent.id}">
                <div class="content-text" id="content-${agent.id}">${agent.phase_0_response ? MarkdownFormatter.formatJSON(agent.phase_0_response) : waitingText}</div>
            </div>
        `;
    }
    
    /**
     * Attach event listeners to agent node
     */
    _attachEventListeners(node, agentId, handlers) {
        // No controls on agent nodes anymore - selection is the only interaction
        // All control interactions are handled by ControlPanelManager
    }
    
    /**
     * Get translated status text
     */
    _getStatusText(status) {
        if (!this.lang) {
            // Fallback for status display mapping
            const statusDisplayMap = {
                'halted': 'Phase Complete',
                'tasklist_error': 'Tasklist Error'
            };
            return statusDisplayMap[status] || status;
        }
        
        // Use translation keys
        return this.lang.t(`status.${status}`);
    }
    
    /**
     * Update agent status badge
     */
    updateStatus(agentId, status) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        const statusEl = node.querySelector('.agent-node-status');
        const displayStatus = this._getStatusText(status);
        
        statusEl.className = `agent-node-status status-badge ${status}`;
        statusEl.textContent = displayStatus;
        
        // Update node border color (preserve selected class)
        const nodeClass = status === 'running' ? 'active' : status;
        const isSelected = node.classList.contains('selected');
        node.className = `agent-node ${nodeClass}`;
        if (isSelected) {
            node.classList.add('selected');
        }
    }
    
    /**
     * Update agent fields (name, context, temperature)
     */
    updateFields(agent) {
        const node = document.getElementById(`agent-${agent.id}`);
        if (!node) return;
        
        // Update name
        const nameEl = node.querySelector('.agent-node-info h3');
        if (nameEl) {
            nameEl.textContent = agent.name;
        }
        
        // Update context
        const contextEl = node.querySelector('.agent-node-context');
        if (agent.context) {
            if (contextEl) {
                contextEl.textContent = agent.context;
            } else {
                const infoDiv = node.querySelector('.agent-node-info');
                const newContext = DOMUtils.createElement('div', {
                    className: 'agent-node-context',
                    textContent: agent.context
                });
                infoDiv.appendChild(newContext);
            }
        } else if (contextEl) {
            contextEl.remove();
        }
        
        // Update temperature
        const tempLabel = this.lang ? this.lang.t('agent.temperature', { value: agent.temperature || 'N/A' }) : `Temp: ${agent.temperature || 'N/A'}`;
        const metaEl = node.querySelector('.agent-node-meta');
        if (metaEl) {
            metaEl.innerHTML = `<span>${tempLabel}</span>`;
        }
    }
    
    /**
     * Clear agent content
     */
    clearContent(agentId) {
        const contentDiv = document.getElementById(`content-${agentId}`);
        if (contentDiv) {
            contentDiv.textContent = '';
        }
    }
    
    /**
     * Update agent content
     */
    updateContent(agentId, content, append = false) {
        const contentDiv = document.getElementById(`content-${agentId}`);
        if (!contentDiv) return;
        
        if (append) {
            contentDiv.textContent += content;
        } else {
            const formatted = MarkdownFormatter.formatJSON(content);
            contentDiv.innerHTML = formatted;
        }
        
        // Auto-scroll
        DOMUtils.scrollToBottom(contentDiv);
    }
    
    /**
     * Set content expanded state
     */
    setContentExpanded(agentId, expanded) {
        const contentContainer = document.getElementById(`content-container-${agentId}`);
        if (!contentContainer) return;
        
        if (expanded) {
            contentContainer.classList.add('expanded');
        } else {
            contentContainer.classList.remove('expanded');
        }
    }
    
    /**
     * Show error message
     */
    showError(agentId, error) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        const errorPrefix = this.lang ? this.lang.t('agent.error_prefix') : 'Error:';
        const meta = node.querySelector('.agent-node-meta');
        if (meta) {
            const errorDiv = DOMUtils.createElement('div', {
                className: 'agent-error',
                textContent: `${errorPrefix} ${error}`
            });
            meta.appendChild(errorDiv);
        }
    }
    
    /**
     * Remove agent node
     */
    removeAgent(agentId) {
        const node = document.getElementById(`agent-${agentId}`);
        if (node) {
            AnimationUtils.fadeOut(node, ANIMATION_DURATIONS.AGENT_FADE_OUT).then(() => {
                node.remove();
            });
        }
    }
    
    /**
     * Set agent as selected (visual feedback)
     */
    setSelected(agentId, selected) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        if (selected) {
            node.classList.add('selected');
        } else {
            node.classList.remove('selected');
        }
    }
}
