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
import { ANIMATION_DURATIONS } from '../constants.js';

export class TaskRenderer {
    constructor(containerSelector, languageService = null) {
        this.container = document.querySelector(containerSelector);
        this.lang = languageService;
    }
    
    /**
     * Render a task node
     */
    renderTask(agentId, task, index, totalTasks, eventHandlers = {}) {
        const node = DOMUtils.createElement('div', {
            className: `task-node card-base ${task.status || 'created'} initial-animation task-hidden`,
            id: `task-${agentId}-${task.id}`,
            dataset: {
                agentId: agentId,
                taskId: task.id
            }
        });
        
        node.innerHTML = this._getTaskTemplate(agentId, task, index, totalTasks);
        
        this.container.appendChild(node);
        
        // Remove animation class after animation completes, with stagger delay
        const staggerDelay = ANIMATION_DURATIONS.TASK_STAGGER_DELAY * index;
        setTimeout(() => {
            node.classList.remove('initial-animation');
        }, ANIMATION_DURATIONS.AGENT_INITIAL_ANIMATION + staggerDelay);
        
        // Add click handler for selection
        if (eventHandlers.onSelect) {
            node.addEventListener('click', (e) => {
                // Don't trigger selection if clicking interactive elements
                if (!e.target.closest('button, input, label')) {
                    const taskKey = `${agentId}-task-${task.id}`;
                    eventHandlers.onSelect(taskKey);
                }
            });
        }
        
        return node;
    }
    
    /**
     * Get task HTML template
     */
    _getTaskTemplate(agentId, task, index, totalTasks) {
        // Determine task status - if validation failed, task status is failed
        let taskStatus = task.status || 'created';
        if (task.validation && !task.validation.is_valid) {
            taskStatus = 'failed';
        }
        
        const taskOutput = task.output || (this.lang ? this.lang.t('task.no_output') : 'No output yet');
        const statusText = this.lang ? this.lang.t(`status.${taskStatus}`) : taskStatus;
        const taskOrderText = this.lang ? this.lang.t('task.order', { order: index + 1 }) : `Task ${index + 1}`;
        
        const objectiveLabel = this.lang ? this.lang.t('task.objective') : 'Objective';
        const expectationLabel = this.lang ? this.lang.t('task.expectation') : 'Expectation';
        const validationLabel = this.lang ? this.lang.t('task.validation') : 'Validation';
        const outputLabel = this.lang ? this.lang.t('task.output') : 'Output';
        
        // Generate validation HTML
        const validationHtml = this._getValidationHTML(agentId, task);
        
        return `
            <div class="task-node-header">
                <div class="task-node-header-info">
                    <h4>${MarkdownFormatter.escapeHtml(task.name)}</h4>
                    <div class="task-node-order">${taskOrderText} of ${totalTasks}</div>
                </div>
                <div class="task-node-status status-badge ${taskStatus}">${statusText}</div>
            </div>
            <div class="task-node-body">
                <div class="task-node-info-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">${objectiveLabel}</div>
                        <div class="task-node-section-content">
                            ${MarkdownFormatter.escapeHtml(task.description)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">${expectationLabel}</div>
                        <div class="task-node-section-content">
                            ${MarkdownFormatter.escapeHtml(task.expected_output)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">${validationLabel}</div>
                        ${validationHtml}
                    </div>
                </div>
                <div class="task-node-output-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">${outputLabel}</div>
                        <div class="task-node-content content-container" id="task-content-${agentId}-${task.id}">
                            <div class="content-text">${MarkdownFormatter.formatMarkdown(taskOutput)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Get validation HTML based on task validation data
     */
    _getValidationHTML(agentId, task) {
        const notValidatedText = this.lang ? this.lang.t('task.validation.not_validated') : 'Not yet validated';
        
        if (!task.validation) {
            return `
                <div class="task-node-validation" id="task-validation-${agentId}-${task.id}">
                    <div class="validation-result">${notValidatedText}</div>
                </div>
            `;
        }
        
        const { is_valid, score, reason } = task.validation;
        const validationClass = is_valid ? 'valid' : 'invalid';
        const validText = this.lang ? this.lang.t('task.validation.valid') : '✓ Valid';
        const invalidText = this.lang ? this.lang.t('task.validation.invalid') : '✗ Invalid';
        const scoreText = this.lang ? this.lang.t('task.validation.score', { score }) : `Score: ${score}/100`;
        
        return `
            <div class="task-node-validation ${validationClass} show" id="task-validation-${agentId}-${task.id}">
                <div class="validation-result">
                    <strong>${is_valid ? validText : invalidText}</strong>
                    <span class="validation-score">${scoreText}</span>
                    <div class="validation-reason">${MarkdownFormatter.escapeHtml(reason)}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Set task as selected (visual feedback)
     * Pure rendering function - accepts element directly
     * 
     * @param {HTMLElement} element - Task element to update
     * @param {boolean} selected - Whether task is selected
     */
    setSelected(element, selected) {
        if (!element) return;
        
        if (selected) {
            element.classList.add('task-selected');
        } else {
            element.classList.remove('task-selected');
        }
    }
    
    /**
     * Update task status
     */
    updateStatus(element, status) {
        const statusEl = element.querySelector('.task-node-status');
        if (statusEl) {
            const statusText = this.lang ? this.lang.t(`status.${status}`) : status;
            statusEl.className = `task-node-status status-badge ${status}`;
            statusEl.textContent = statusText;
        }
        
        // Update task node class for border styling
        element.classList.remove('running', 'completed', 'failed', 'cancelled', 'created', 'halted');
        element.classList.add(status);
        
        // Add pulse animation when task becomes active
        // Use TASK_TRANSITION (400ms) instead of PULSE (300ms) to match taskPulseScale animation
        if (status === 'running') {
            AnimationUtils.pulse(element, ANIMATION_DURATIONS.TASK_TRANSITION);
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
        DOMUtils.scrollToBottom(contentEl);
    }
    
    /**
     * Show validation loading spinner
     */
    showValidationLoading(agentId, taskId) {
        const validationEl = document.getElementById(`task-validation-${agentId}-${taskId}`);
        if (!validationEl) return;
        
        const resultEl = validationEl.querySelector('.validation-result');
        if (!resultEl) return;
        
        const validatingText = this.lang ? this.lang.t('task.validation.loading') : 'Validating...';
        
        validationEl.className = 'task-node-validation validating';
        
        resultEl.innerHTML = `
            <div class="validation-spinner">
                <div class="spinner-icon">⟳</div>
                <span>${validatingText}</span>
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
        
        const validText = this.lang ? this.lang.t('task.validation.valid') : '✓ Valid';
        const invalidText = this.lang ? this.lang.t('task.validation.invalid') : '✗ Invalid';
        const scoreText = this.lang ? this.lang.t('task.validation.score', { score }) : `Score: ${score}/100`;
        
        validationEl.className = `task-node-validation ${isValid ? 'valid' : 'invalid'}`;
        
        resultEl.innerHTML = `
            <strong>${isValid ? validText : invalidText}</strong>
            <span class="validation-score">${scoreText}</span>
            <div class="validation-reason">${MarkdownFormatter.escapeHtml(reason)}</div>
        `;
        
        // Animate in and keep visible permanently
        requestAnimationFrame(() => {
            validationEl.classList.add('show');
        });
    }
    
    /**
     * REMOVED: setPosition() - Now handled by TaskPositionManager
     * All task positioning is centralized through CanvasManager.taskPositionManager
     */
    
    /**
     * Animate task out
     */
    animateOut(element, callback) {
        element.classList.add('animating-out');
        setTimeout(() => {
            if (callback) callback();
        }, ANIMATION_DURATIONS.TASK_ANIMATION_OUT);
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
        }, 2000); // Using literal as it matches UI_TIMINGS.HIGHLIGHT_DURATION
    }
}
