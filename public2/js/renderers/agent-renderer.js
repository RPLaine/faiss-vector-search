/**
 * Agent Renderer - Pure agent DOM rendering
 * 
 * Responsibilities:
 * - Create agent DOM elements
 * - Update agent UI elements
 * - NO business logic
 * - NO API calls
 * - NO state management
 */

import { MarkdownFormatter } from '../utils/markdown-formatter.js';
import { DOMUtils } from '../utils/dom-utils.js';
import { AnimationUtils } from '../utils/animation-utils.js';
import { ANIMATION_DURATIONS } from '../constants.js';

export class AgentRenderer {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
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
        
        return node;
    }
    
    /**
     * Get agent HTML template
     */
    _getAgentTemplate(agent) {
        return `
            <div class="agent-node-header">
                <div class="agent-node-info">
                    <h3>${MarkdownFormatter.escapeHtml(agent.name)}</h3>
                    ${agent.context ? `<div class="agent-node-context">${MarkdownFormatter.escapeHtml(agent.context)}</div>` : ''}
                </div>
                <div class="agent-node-status status-badge ${agent.status}">${agent.status}</div>
            </div>
            <div class="agent-node-meta">
                <span>Temp: ${agent.temperature || 'N/A'}</span>
            </div>
            <div class="agent-node-controls">
                <button type="button" class="btn btn-primary btn-action" data-agent-id="${agent.id}" data-action="start">
                    <span class="btn-icon">▶️</span>
                    <span class="btn-text">Start</span>
                </button>
                <button type="button" class="btn btn-primary btn-continue" data-agent-id="${agent.id}" style="display: none;">
                    <span class="btn-icon">⏩</span>
                    Continue
                </button>
                <button type="button" class="btn btn-secondary btn-edit" data-agent-id="${agent.id}">
                    <span class="btn-icon">✏️</span>
                    Edit
                </button>
                <button type="button" class="btn btn-secondary btn-delete" data-agent-id="${agent.id}">
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
            <div class="agent-node-content content-container ${agent.expanded ? 'expanded' : ''}" id="content-container-${agent.id}">
                <div class="content-text" id="content-${agent.id}">${agent.phase_0_response ? MarkdownFormatter.formatJSON(agent.phase_0_response) : 'Waiting to start...'}</div>
            </div>
        `;
    }
    
    /**
     * Attach event listeners to agent node
     */
    _attachEventListeners(node, agentId, handlers) {
        // Action button (Start/Stop/Redo)
        const actionBtn = node.querySelector('.btn-action');
        if (actionBtn && handlers.onAction) {
            actionBtn.addEventListener('click', () => handlers.onAction(agentId));
        }
        
        // Continue button
        const continueBtn = node.querySelector('.btn-continue');
        if (continueBtn && handlers.onContinue) {
            continueBtn.addEventListener('click', () => handlers.onContinue(agentId));
        }
        
        // Edit button
        const editBtn = node.querySelector('.btn-edit');
        if (editBtn && handlers.onEdit) {
            editBtn.addEventListener('click', () => handlers.onEdit(agentId));
        }
        
        // Delete button
        const deleteBtn = node.querySelector('.btn-delete');
        if (deleteBtn && handlers.onDelete) {
            deleteBtn.addEventListener('click', () => handlers.onDelete(agentId));
        }
        
        // Auto checkbox
        const autoCheckbox = node.querySelector('.auto-checkbox');
        if (autoCheckbox && handlers.onAutoToggle) {
            autoCheckbox.addEventListener('change', (e) => handlers.onAutoToggle(agentId, e.target.checked));
        }
        
        // Halt checkbox
        const haltCheckbox = node.querySelector('.halt-checkbox');
        if (haltCheckbox && handlers.onHaltToggle) {
            haltCheckbox.addEventListener('change', (e) => handlers.onHaltToggle(agentId, e.target.checked));
        }
        
        // Expand checkbox
        const expandCheckbox = node.querySelector('.expand-checkbox');
        if (expandCheckbox && handlers.onExpandToggle) {
            expandCheckbox.addEventListener('change', (e) => handlers.onExpandToggle(agentId, e.target.checked));
        }
    }
    
    /**
     * Update agent status badge
     */
    updateStatus(agentId, status) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        const statusEl = node.querySelector('.agent-node-status');
        
        // Map internal status to display text
        const statusDisplayMap = {
            'halted': 'Phase Complete',
            'tasklist_error': 'Tasklist Error'
        };
        const displayStatus = statusDisplayMap[status] || status;
        
        statusEl.className = `agent-node-status status-badge ${status}`;
        statusEl.textContent = displayStatus;
        
        // Update node border color
        const nodeClass = status === 'running' ? 'active' : status;
        node.className = `agent-node ${nodeClass}`;
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
        const metaEl = node.querySelector('.agent-node-meta');
        if (metaEl) {
            metaEl.innerHTML = `<span>Temp: ${agent.temperature || 'N/A'}</span>`;
        }
        
        // Update checkboxes
        const autoCheckbox = node.querySelector('.auto-checkbox');
        if (autoCheckbox) autoCheckbox.checked = agent.auto || false;
        
        const haltCheckbox = node.querySelector('.halt-checkbox');
        if (haltCheckbox) haltCheckbox.checked = agent.halt || false;
        
        const expandCheckbox = node.querySelector('.expand-checkbox');
        if (expandCheckbox) expandCheckbox.checked = agent.expanded || false;
    }
    
    /**
     * Set action button state
     */
    setActionButton(agentId, action, icon, text) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        
        const actionBtn = node.querySelector('.btn-action');
        if (!actionBtn) return;
        
        actionBtn.dataset.action = action;
        
        const iconSpan = actionBtn.querySelector('.btn-icon');
        const textSpan = actionBtn.querySelector('.btn-text');
        
        if (iconSpan) iconSpan.textContent = icon;
        if (textSpan) textSpan.textContent = text;
        
        // Update button style
        if (action === 'stop') {
            actionBtn.classList.remove('btn-primary');
            actionBtn.classList.add('btn-danger');
        } else {
            actionBtn.classList.remove('btn-danger');
            actionBtn.classList.add('btn-primary');
        }
    }
    
    /**
     * Show/hide buttons
     */
    showButton(agentId, selector) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        const btn = node.querySelector(selector);
        if (btn) DOMUtils.show(btn);
    }
    
    hideButton(agentId, selector) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        const btn = node.querySelector(selector);
        if (btn) DOMUtils.hide(btn);
    }
    
    /**
     * Show/hide controls
     */
    showControl(agentId, selector) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        const control = node.querySelector(selector);
        if (control) DOMUtils.show(control);
    }
    
    hideControl(agentId, selector) {
        const node = document.getElementById(`agent-${agentId}`);
        if (!node) return;
        const control = node.querySelector(selector);
        if (control) DOMUtils.hide(control);
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
        contentDiv.scrollTop = contentDiv.scrollHeight;
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
        
        const meta = node.querySelector('.agent-node-meta');
        if (meta) {
            const errorDiv = DOMUtils.createElement('div', {
                className: 'agent-error',
                textContent: `Error: ${error}`
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
}
