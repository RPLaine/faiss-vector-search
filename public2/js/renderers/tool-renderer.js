/**
 * Tool Renderer - Pure tool call DOM rendering
 * 
 * Responsibilities:
 * - Create tool call DOM elements (FAISS retrieval nodes)
 * - Update tool UI elements
 * - Render document lists, threshold progressions
 * - NO business logic
 * - NO API calls
 * - NO state management
 */

import { MarkdownFormatter } from '../utils/markdown-formatter.js';
import { DOMUtils } from '../utils/dom-utils.js';
import { AnimationUtils } from '../utils/animation-utils.js';
import { ANIMATION_DURATIONS } from '../constants.js';

export class ToolRenderer {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
    }
    
    /**
     * Render a tool call node
     */
    renderTool(agentId, taskId, toolId, toolData) {
        const node = DOMUtils.createElement('div', {
            className: `tool-node card-base initial-animation tool-hidden`,
            id: `tool-${agentId}-${taskId}-${toolId}`,
            dataset: {
                agentId: agentId,
                taskId: taskId,
                toolId: toolId,
                toolType: toolData.type || 'unknown'
            }
        });
        
        node.innerHTML = this._getToolTemplate(agentId, taskId, toolId, toolData);
        
        this.container.appendChild(node);
        
        // Remove animation class after animation completes
        setTimeout(() => {
            node.classList.remove('initial-animation');
        }, ANIMATION_DURATIONS.AGENT_INITIAL_ANIMATION);
        
        // Add document click handlers
        this._attachDocumentClickHandlers(node);
        
        return node;
    }
    
    /**
     * Get tool HTML template
     */
    _getToolTemplate(agentId, taskId, toolId, toolData) {
        const type = toolData.type || 'unknown';
        const status = toolData.status || 'running';
        const query = toolData.query || '';
        const documents = toolData.documents || [];
        const thresholdStats = toolData.threshold_stats || {};
        const thresholdUsed = toolData.threshold_used;
        const retrievalTime = toolData.retrieval_time;
        
        // Icon based on tool type
        const icon = this._getToolIcon(type);
        
        return `
            <div class="tool-node-header">
                <div class="tool-node-header-info">
                    <h4>${icon} ${this._getToolTypeName(type)}</h4>
                </div>
                <div class="tool-node-status status-badge ${status}">${status}</div>
            </div>
            <div class="tool-node-body">
                <div class="tool-node-info-column">
                    <div class="tool-node-section tool-query-section">
                        <div class="tool-node-section-title">Query</div>
                        <div class="tool-node-section-content">
                            ${MarkdownFormatter.escapeHtml(query)}
                        </div>
                    </div>
                    
                    ${this._getThresholdProgressionHTML(thresholdStats)}
                    
                    <div class="tool-node-section tool-stats-section">
                        <div class="tool-node-section-title">Statistics</div>
                        <div class="tool-stats">
                            ${thresholdUsed !== undefined ? `<span class="tool-stat"><strong>Threshold:</strong> ${thresholdUsed.toFixed(3)}</span>` : ''}
                            ${retrievalTime !== undefined ? `<span class="tool-stat"><strong>Time:</strong> ${retrievalTime.toFixed(2)}s</span>` : ''}
                            ${thresholdStats.attempts ? `<span class="tool-stat"><strong>Attempts:</strong> ${thresholdStats.attempts}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="tool-node-output-column">
                    <div class="tool-node-section tool-documents-section">
                        <div class="tool-node-section-title">Retrieved Documents (${documents.length})</div>
                        <div class="tool-documents-list">
                            ${this._getDocumentsHTML(agentId, taskId, toolId, documents)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Get tool type icon
     */
    _getToolIcon(type) {
        switch(type) {
            case 'faiss_retrieval':
                return '📚';
            case 'web_search':
                return '🔍';
            case 'api_call':
                return '🔌';
            default:
                return '🛠️';
        }
    }
    
    /**
     * Get tool type display name
     */
    _getToolTypeName(type) {
        switch(type) {
            case 'faiss_retrieval':
                return 'Knowledge Retrieval';
            case 'web_search':
                return 'Web Search';
            case 'api_call':
                return 'API Call';
            default:
                return 'Tool Call';
        }
    }
    
    /**
     * Get threshold progression HTML
     */
    _getThresholdProgressionHTML(thresholdStats) {
        if (!thresholdStats || !thresholdStats.progression || thresholdStats.progression.length === 0) {
            return '';
        }
        
        const progression = thresholdStats.progression;
        const targetReached = thresholdStats.target_reached;
        
        return `
            <div class="tool-node-section tool-threshold-section">
                <div class="tool-node-section-title">Threshold Progression</div>
                <div class="tool-threshold-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Attempt</th>
                                <th>Threshold</th>
                                <th>Hits</th>
                                <th>Target</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${progression.map((attempt, i) => `
                                <tr class="${attempt.target_reached ? 'target-reached' : ''}">
                                    <td>${i + 1}</td>
                                    <td>${attempt.threshold.toFixed(3)}</td>
                                    <td>${attempt.hits}</td>
                                    <td>${thresholdStats.hit_target || 'N/A'}</td>
                                    <td>${attempt.target_reached ? '✓' : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    /**
     * Get documents list HTML
     */
    _getDocumentsHTML(agentId, taskId, toolId, documents) {
        if (!documents || documents.length === 0) {
            return '<div class="tool-no-documents">No documents retrieved</div>';
        }
        
        return documents.map((doc, i) => `
            <div class="tool-document-item">
                <div class="tool-document-header">
                    <span class="tool-document-number">#${i + 1}</span>
                    <span class="tool-document-score">${(doc.score || 0).toFixed(3)}</span>
                </div>
                <div class="tool-document-filename-link" 
                     data-agent-id="${agentId}" 
                     data-task-id="${taskId}" 
                     data-tool-id="${toolId}" 
                     data-doc-index="${i}"
                     data-filename="${MarkdownFormatter.escapeHtml(doc.filename || 'unknown')}">
                    ${MarkdownFormatter.escapeHtml(doc.filename || 'unknown')}
                </div>
                <div class="tool-document-preview">
                    ${MarkdownFormatter.escapeHtml(this._truncateText(doc.content, 150))}
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Truncate text for preview
     */
    _truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    /**
     * Attach document click handlers to open modal
     */
    _attachDocumentClickHandlers(node) {
        const docLinks = node.querySelectorAll('.tool-document-filename-link');
        docLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const agentId = link.dataset.agentId;
                const taskId = link.dataset.taskId;
                const toolId = link.dataset.toolId;
                const docIndex = parseInt(link.dataset.docIndex);
                const filename = link.dataset.filename;
                
                // Emit event for controller to handle
                node.dispatchEvent(new CustomEvent('openDocumentModal', {
                    bubbles: true,
                    detail: { agentId, taskId, toolId, docIndex, filename }
                }));
            });
        });
    }
    
    /**
     * Open document viewer modal
     */
    openDocumentModal(filename, content) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'document-modal-overlay';
        modal.innerHTML = `
            <div class="document-modal">
                <div class="document-modal-header">
                    <h3>${MarkdownFormatter.escapeHtml(filename)}</h3>
                    <button class="document-modal-close">&times;</button>
                </div>
                <div class="document-modal-body">
                    <textarea class="document-content-editor">${MarkdownFormatter.escapeHtml(content)}</textarea>
                </div>
                <div class="document-modal-footer">
                    <button class="btn-secondary document-modal-cancel">Cancel</button>
                    <button class="btn-primary document-modal-save">Save & Rebuild Index</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus textarea
        const textarea = modal.querySelector('.document-content-editor');
        textarea.focus();
        
        // Close handlers
        const closeModal = () => {
            modal.classList.add('closing');
            setTimeout(() => modal.remove(), 300);
        };
        
        modal.querySelector('.document-modal-close').addEventListener('click', closeModal);
        modal.querySelector('.document-modal-cancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Save handler
        modal.querySelector('.document-modal-save').addEventListener('click', () => {
            const newContent = textarea.value;
            // Emit save event
            document.dispatchEvent(new CustomEvent('saveDocument', {
                detail: { filename, content: newContent }
            }));
            closeModal();
        });
        
        // Keyboard shortcuts
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                modal.querySelector('.document-modal-save').click();
            }
        });
    }
    
    /**
     * Update tool status
     */
    updateStatus(element, status) {
        const statusEl = element.querySelector('.tool-node-status');
        if (statusEl) {
            statusEl.className = `tool-node-status status-badge ${status}`;
            statusEl.textContent = status;
        }
        
        // Add pulse animation when complete
        if (status === 'completed') {
            AnimationUtils.pulse(element, ANIMATION_DURATIONS.PULSE);
        }
    }
    
    /**
     * Update threshold progression in real-time
     */
    updateThresholdProgression(element, thresholdStats) {
        const thresholdSection = element.querySelector('.tool-threshold-section');
        if (!thresholdSection) return;
        
        thresholdSection.innerHTML = `
            <div class="tool-node-section-title">Threshold Progression</div>
            ${this._getThresholdProgressionHTML(thresholdStats).replace(/<div class="tool-node-section tool-threshold-section">.*?<\/div>/, '')}
        `;
    }
    
    /**
     * Update documents list
     */
    updateDocuments(element, documents) {
        const docsList = element.querySelector('.tool-documents-list');
        if (!docsList) return;
        
        const agentId = element.dataset.agentId;
        const taskId = element.dataset.taskId;
        const toolId = element.dataset.toolId;
        
        docsList.innerHTML = this._getDocumentsHTML(agentId, taskId, toolId, documents);
        
        // Reattach click handlers
        this._attachDocumentClickHandlers(element);
        
        // Update document count in title
        const docsTitle = element.querySelector('.tool-documents-section .tool-node-section-title');
        if (docsTitle) {
            docsTitle.textContent = `Retrieved Documents (${documents.length})`;
        }
    }
    
    /**
     * Update tool stats
     */
    updateStats(element, stats) {
        const statsSection = element.querySelector('.tool-stats');
        if (!statsSection) return;
        
        const { threshold_used, retrieval_time, attempts } = stats;
        
        let html = '';
        if (threshold_used !== undefined) {
            html += `<span class="tool-stat"><strong>Threshold:</strong> ${threshold_used.toFixed(3)}</span>`;
        }
        if (retrieval_time !== undefined) {
            html += `<span class="tool-stat"><strong>Time:</strong> ${retrieval_time.toFixed(2)}s</span>`;
        }
        if (attempts !== undefined) {
            html += `<span class="tool-stat"><strong>Attempts:</strong> ${attempts}</span>`;
        }
        
        statsSection.innerHTML = html;
    }
    
    /**
     * Show tool node (fade in)
     */
    show(element) {
        element.classList.remove('tool-hidden');
        AnimationUtils.fadeIn(element, ANIMATION_DURATIONS.FADE);
    }
    
    /**
     * Hide tool node (fade out)
     */
    hide(element) {
        AnimationUtils.fadeOut(element, ANIMATION_DURATIONS.FADE).then(() => {
            element.classList.add('tool-hidden');
        });
    }
    
    /**
     * Remove tool node from DOM
     */
    remove(element) {
        AnimationUtils.fadeOut(element, ANIMATION_DURATIONS.FADE).then(() => {
            element.remove();
        });
    }
}
