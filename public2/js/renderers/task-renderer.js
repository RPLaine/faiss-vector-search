/**
 * Task Renderer - Pure task DOM rendering
 * 
 * Responsibilities:
 * - Create task DOM elements
 * - Update task UI elements  
 * - NO business logic
 * - NO API calls
 * - NO state management
 */

import { MarkdownFormatter } from '../utils/markdown-formatter.js';
import { DOMUtils } from '../utils/dom-utils.js';
import { AnimationUtils } from '../utils/animation-utils.js';

export class TaskRenderer {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
    }
    
    /**
     * Render a task node
     */
    renderTask(agentId, task, index, totalTasks) {
        const node = DOMUtils.createElement('div', {
            className: `task-node animating-in ${task.status || 'created'}`,
            id: `task-${agentId}-${task.id}`,
            dataset: {
                agentId: agentId,
                taskId: task.id
            }
        });
        
        node.innerHTML = this._getTaskTemplate(agentId, task, index, totalTasks);
        
        this.container.appendChild(node);
        
        // Animate in with stagger
        setTimeout(() => {
            node.classList.remove('animating-in');
            node.classList.add('visible');
        }, 200 * (index + 1));
        
        return node;
    }
    
    /**
     * Get task HTML template
     */
    _getTaskTemplate(agentId, task, index, totalTasks) {
        const taskStatus = task.status || 'created';
        const taskOutput = task.output || 'Waiting to start...';
        
        return `
            <div class="task-node-header">
                <div class="task-node-header-info">
                    <h4>${MarkdownFormatter.escapeHtml(task.name)}</h4>
                    <div class="task-node-order">Task ${index + 1} of ${totalTasks}</div>
                </div>
                <div class="task-node-status ${taskStatus}">${taskStatus}</div>
            </div>
            <div class="task-node-body">
                <div class="task-node-info-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">Objective</div>
                        <div class="task-node-section-content">
                            ${MarkdownFormatter.escapeHtml(task.description)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">Expectation</div>
                        <div class="task-node-section-content">
                            ${MarkdownFormatter.escapeHtml(task.expected_output)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">Validation</div>
                        <div class="task-node-validation" id="task-validation-${agentId}-${task.id}">
                            <div class="validation-result">Not yet validated</div>
                        </div>
                    </div>
                </div>
                <div class="task-node-output-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">Output</div>
                        <div class="task-node-content" id="task-content-${agentId}-${task.id}">
                            <div class="content-text">${MarkdownFormatter.formatMarkdown(taskOutput)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Update task status
     */
    updateStatus(element, status) {
        const statusEl = element.querySelector('.task-node-status');
        if (statusEl) {
            statusEl.className = `task-node-status ${status}`;
            statusEl.textContent = status;
        }
        
        // Update task node class for border styling
        element.classList.remove('running', 'completed', 'failed', 'cancelled', 'created', 'halted');
        element.classList.add(status);
        
        // Add pulse animation when task becomes active
        if (status === 'running') {
            AnimationUtils.pulse(element, 300);
        }
    }
    
    /**
     * Update task content
     */
    updateContent(agentId, taskId, content, append = false) {
        const contentEl = document.querySelector(`#task-content-${agentId}-${taskId} .content-text`);
        if (!contentEl) return;
        
        if (append) {
            contentEl.textContent += content;
        } else {
            const formatted = MarkdownFormatter.formatMarkdown(content);
            contentEl.innerHTML = formatted;
        }
        
        // Auto-scroll
        contentEl.scrollTop = contentEl.scrollHeight;
    }
    
    /**
     * Show validation loading spinner
     */
    showValidationLoading(agentId, taskId) {
        const validationEl = document.getElementById(`task-validation-${agentId}-${taskId}`);
        if (!validationEl) return;
        
        const resultEl = validationEl.querySelector('.validation-result');
        if (!resultEl) return;
        
        validationEl.className = 'task-node-validation validating';
        
        resultEl.innerHTML = `
            <div class="validation-spinner">
                <div class="spinner-icon">⟳</div>
                <span>Validating output...</span>
            </div>
        `;
        
        // Show validation container
        requestAnimationFrame(() => {
            validationEl.classList.add('show');
        });
    }
    
    /**
     * Show validation result
     */
    showValidation(agentId, taskId, isValid, reason, score) {
        const validationEl = document.getElementById(`task-validation-${agentId}-${taskId}`);
        if (!validationEl) return;
        
        const resultEl = validationEl.querySelector('.validation-result');
        if (!resultEl) return;
        
        validationEl.className = `task-node-validation ${isValid ? 'valid' : 'invalid'}`;
        
        resultEl.innerHTML = `
            <strong>${isValid ? '✓ Valid' : '✗ Invalid'}</strong>
            <span class="validation-score">Score: ${score}/100</span>
            <div class="validation-reason">${MarkdownFormatter.escapeHtml(reason)}</div>
        `;
        
        // Animate in (already visible if spinner was shown)
        requestAnimationFrame(() => {
            validationEl.classList.add('show');
        });
        
        // If validation is successful, fade out after 2 seconds
        if (isValid) {
            setTimeout(() => {
                validationEl.classList.remove('show');
                validationEl.classList.add('fading-out');
            }, 2000);
        }
    }
    
    /**
     * Set task position
     */
    setPosition(element, x, y, immediate = false) {
        if (immediate) {
            element.classList.add('no-transition');
        } else {
            element.classList.remove('no-transition');
        }
        
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
    }
    
    /**
     * Animate task out
     */
    animateOut(element, callback) {
        element.classList.add('animating-out');
        setTimeout(() => {
            if (callback) callback();
        }, 400);
    }
    
    /**
     * Scroll to task
     */
    scrollToTask(element) {
        DOMUtils.scrollIntoView(element, { block: 'center', inline: 'center' });
    }
    
    /**
     * Highlight task temporarily
     */
    highlightTask(element) {
        element.classList.add('focused');
        setTimeout(() => {
            element.classList.remove('focused');
        }, 2000);
    }
}
