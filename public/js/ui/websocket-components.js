/**
 * WebSocket Display Components
 * Renders WebSocket real-time updates
 */

import { uiManager } from './manager.js';
import { createAccumulatorTable } from './utils/table-builder.js';

// Threshold attempts accumulator
let thresholdTable = null;

/**
 * Display threshold attempt event
 */
export function displayThresholdAttempt(data) {
    // Create accumulator table if it doesn't exist
    if (!thresholdTable) {
        thresholdTable = createAccumulatorTable({
            title: '🔍 Similarity Threshold Attempts',
            className: 'threshold-table',
            collapsible: true,
            collapsed: true,
            columns: [
                { 
                    key: 'threshold', 
                    label: 'Threshold', 
                    format: v => v.toFixed(3) 
                },
                { 
                    key: 'hits', 
                    label: 'Hits' 
                },
                { 
                    key: 'target', 
                    label: 'Target' 
                },
                { 
                    key: 'target_reached',
                    label: 'Status',
                    format: v => v ? '✅ Target Reached' : '🔍 Searching',
                    className: v => v ? 'status-success' : 'status-searching'
                }
            ]
        });
        uiManager.appendElement(thresholdTable.element);
    }
    
    // Add new attempt to table
    thresholdTable.addRow(data);
    
    // If target reached, finalize the table
    if (data.target_reached) {
        thresholdTable.finalize(
            `✅ Similarity Threshold - Target Reached (${data.threshold.toFixed(3)})`,
            { color: '#6a9955' }
        );
        thresholdTable = null;
    }
}

/**
 * Display retrieval start event
 */
export function displayRetrievalStart(data) {
    const box = document.createElement('div');
    box.className = 'action-box retrieval-box';
    box.innerHTML = `
        <div class="action-header">🔍 Dynamic Retrieval</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Query:</span> ${uiManager.escapeHtml(data.query)}</div>
            <div class="detail-item"><span class="label">Top K:</span> ${data.top_k}</div>
            <div class="detail-item"><span class="label">Threshold:</span> ${data.threshold}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display retrieval complete event
 */
export function displayRetrievalComplete(data) {
    const box = document.createElement('div');
    box.className = 'action-box retrieval-result-box';
    box.innerHTML = `
        <div class="action-header">✅ Retrieval Complete</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Documents Found:</span> ${data.num_docs}</div>
            <div class="detail-item"><span class="label">Time:</span> ${data.time.toFixed(2)}s</div>
        </div>
    `;
    
    if (data.documents && data.documents.length > 0) {
        const docsSection = createCollapsibleSection('📚 Retrieved Documents', 'docs-section');
        const docsContainer = document.createElement('div');
        docsContainer.className = 'docs-container';
        
        data.documents.forEach((doc, idx) => {
            const content = typeof doc === 'string' ? doc : (doc.content || JSON.stringify(doc));
            const docItem = document.createElement('div');
            docItem.className = 'doc-item';
            
            const docHeader = document.createElement('div');
            docHeader.className = 'doc-item-header';
            docHeader.textContent = doc.filename ? `${idx + 1}. ${doc.filename}` : `Document ${idx + 1}`;
            
            if (doc.score !== undefined) {
                const scoreSpan = document.createElement('span');
                scoreSpan.className = 'doc-score';
                scoreSpan.textContent = `Score: ${doc.score.toFixed(3)}`;
                docHeader.appendChild(scoreSpan);
            }
            
            const docContent = document.createElement('div');
            docContent.className = 'doc-item-content';
            docContent.textContent = content;
            
            docItem.appendChild(docHeader);
            docItem.appendChild(docContent);
            docsContainer.appendChild(docItem);
        });
        
        docsSection.appendChild(docsContainer);
        box.appendChild(docsSection);
    }
    
    uiManager.appendElement(box);
}

/**
 * Display LLM request event
 */
export function displayLLMRequest(data) {
    const box = document.createElement('div');
    box.className = 'action-box llm-request-box';
    
    box.innerHTML = `
        <div class="action-header llm-collapsible">🚀 LLM API Request</div>
        <div class="action-details llm-content collapsed">
            <div class="detail-item"><span class="label">Endpoint:</span> ${uiManager.escapeHtml(data.endpoint)}</div>
            <div class="detail-item"><span class="label">Model:</span> ${data.model}</div>
            <div class="detail-item"><span class="label">Temperature:</span> ${data.temperature}</div>
            <div class="detail-item"><span class="label">Max Tokens:</span> ${data.max_tokens}</div>
        </div>
    `;
    
    // Add click handler for main collapse/expand
    const header = box.querySelector('.llm-collapsible');
    const content = box.querySelector('.llm-content');
    
    header.onclick = () => {
        content.classList.toggle('collapsed');
    };
    
    // Add collapsible prompt section
    const promptSection = createCollapsibleSection('📝 Prompt', 'prompt-section');
    const promptContent = document.createElement('pre');
    promptContent.className = 'prompt-content';
    promptContent.textContent = data.prompt;
    promptSection.appendChild(promptContent);
    content.appendChild(promptSection);
    
    // Add collapsible payload section (collapsed by default)
    const payloadSection = createCollapsibleSection('🔧 Raw Payload', 'payload-section', true);
    const payloadContent = document.createElement('pre');
    payloadContent.className = 'payload-content';
    payloadContent.textContent = JSON.stringify(data.payload, null, 2);
    payloadSection.appendChild(payloadContent);
    content.appendChild(payloadSection);
    
    uiManager.appendElement(box);
}

/**
 * Display LLM response event
 */
export function displayLLMResponse(data) {
    const box = document.createElement('div');
    box.className = data.success ? 'action-box llm-response-box' : 'action-box llm-error-box';
    
    if (data.success) {
        box.innerHTML = `
            <div class="action-header llm-collapsible">✅ LLM Response</div>
            <div class="action-details llm-content collapsed">
                <div class="detail-item"><span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s</div>
                <div class="detail-item"><span class="label">Response Length:</span> ${data.response_length} characters</div>
            </div>
        `;
        
        // Add click handler for main collapse/expand
        const header = box.querySelector('.llm-collapsible');
        const content = box.querySelector('.llm-content');
        
        header.onclick = () => {
            content.classList.toggle('collapsed');
        };
        
        // Add collapsible response section
        const responseSection = createCollapsibleSection('💬 Full Response', 'response-section');
        const responseContent = document.createElement('div');
        responseContent.className = 'response-text-full';
        responseContent.textContent = data.text;
        responseSection.appendChild(responseContent);
        content.appendChild(responseSection);
    } else {
        box.innerHTML = `
            <div class="action-header">❌ LLM Error</div>
            <div class="error-message">${uiManager.escapeHtml(data.error)}</div>
        `;
    }
    
    uiManager.appendElement(box);
}

/**
 * Display evaluation start event
 */
export function displayEvaluationStart(data) {
    const box = document.createElement('div');
    box.className = 'action-box evaluation-box';
    box.innerHTML = `
        <div class="action-header">🎯 Starting Evaluation</div>
        <div class="action-details">
            <div class="detail-item">${data.message || 'Evaluating response quality...'}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display evaluation complete event
 */
export function displayEvaluationComplete(data) {
    const box = document.createElement('div');
    box.className = 'action-box evaluation-result-box';
    box.innerHTML = `
        <div class="action-header">✅ Evaluation Complete</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Score:</span> ${data.score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Time:</span> ${data.time.toFixed(2)}s</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display temperature test event
 */
export function displayTemperatureTest(data) {
    const box = document.createElement('div');
    box.className = 'action-box temperature-test-box';
    box.innerHTML = `
        <div class="action-header">🌡️ Testing Temperature: ${data.temperature.toFixed(2)}</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Test:</span> ${data.test_number} / ${data.total_tests}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display temperature response event
 */
export function displayTemperatureResponse(data) {
    const box = document.createElement('div');
    box.className = 'action-box temperature-response-box';
    box.innerHTML = `
        <div class="action-header">🤖 Response (T=${data.temperature.toFixed(2)})</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s</div>
        </div>
    `;
    
    // Add collapsible response section
    const responseSection = createCollapsibleSection('💬 Full Response', 'response-section');
    const responseContent = document.createElement('div');
    responseContent.className = 'response-text-full';
    responseContent.textContent = data.response;
    responseSection.appendChild(responseContent);
    box.appendChild(responseSection);
    
    uiManager.appendElement(box);
}

/**
 * Display temperature evaluation event
 */
export function displayTemperatureEvaluation(data) {
    const box = document.createElement('div');
    box.className = 'action-box temperature-evaluation-box';
    box.innerHTML = `
        <div class="action-header">📊 Evaluation (T=${data.temperature.toFixed(2)})</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Score:</span> ${data.score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Evaluation Time:</span> ${data.evaluation_time.toFixed(2)}s</div>
        </div>
    `;
    
    if (data.reasoning) {
        const reasoningSection = createCollapsibleSection('💭 Reasoning', 'reasoning-section', true);
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-text';
        reasoningContent.textContent = data.reasoning;
        reasoningSection.appendChild(reasoningContent);
        box.appendChild(reasoningSection);
    }
    
    uiManager.appendElement(box);
}

/**
 * Display old temperature test event (deprecated - keep for compatibility)
 */
export function displayTemperatureTestOld(data) {
    const box = document.createElement('div');
    box.className = 'action-box temperature-test-box';
    box.innerHTML = `
        <div class="action-header">🌡️ Temperature Test</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Iteration:</span> ${data.iteration}/${data.total}</div>
            <div class="detail-item"><span class="label">Temperature:</span> ${data.temperature.toFixed(3)}</div>
            <div class="detail-item"><span class="label">Score:</span> ${data.score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Best So Far:</span> ${data.best_score.toFixed(2)}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display improvement iteration event
 */
export function displayImprovementIteration(data) {
    const box = document.createElement('div');
    box.className = 'action-box improvement-iteration-box';
    const action = data.action === 'improving' ? '🔧 Improving' : '📊 Evaluating';
    box.innerHTML = `
        <div class="action-header">🔄 Iteration ${data.iteration} - ${action}</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Action:</span> ${data.action}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display improvement response event
 */
export function displayImprovementResponse(data) {
    const box = document.createElement('div');
    box.className = 'action-box improvement-response-box';
    box.innerHTML = `
        <div class="action-header">🤖 Improved Response (Iteration ${data.iteration})</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s</div>
        </div>
    `;
    
    // Add collapsible response section
    const responseSection = createCollapsibleSection('💬 Full Response', 'response-section');
    const responseContent = document.createElement('div');
    responseContent.className = 'response-text-full';
    responseContent.textContent = data.response;
    responseSection.appendChild(responseContent);
    box.appendChild(responseSection);
    
    uiManager.appendElement(box);
}

/**
 * Display improvement evaluation event
 */
export function displayImprovementEvaluation(data) {
    const box = document.createElement('div');
    box.className = 'action-box improvement-evaluation-box';
    const changeIndicator = data.is_improvement ? '✅' : (data.score_change < 0 ? '⚠️' : '➖');
    const changeClass = data.is_improvement ? 'positive' : (data.score_change < 0 ? 'negative' : 'neutral');
    box.innerHTML = `
        <div class="action-header">${changeIndicator} Evaluation (Iteration ${data.iteration})</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Score:</span> ${data.score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Change:</span> <span class="${changeClass}">${data.score_change >= 0 ? '+' : ''}${data.score_change.toFixed(3)}</span></div>
            <div class="detail-item"><span class="label">Status:</span> ${data.is_improvement ? 'Improved ✅' : 'No improvement'}</div>
        </div>
    `;
    
    if (data.reasoning) {
        const reasoningSection = createCollapsibleSection('💭 Reasoning', 'reasoning-section', true);
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-text';
        reasoningContent.textContent = data.reasoning;
        reasoningSection.appendChild(reasoningContent);
        box.appendChild(reasoningSection);
    }
    
    uiManager.appendElement(box);
}

/**
 * Display old improvement iteration event (deprecated - keep for compatibility)
 */
export function displayImprovementIterationOld(data) {
    const box = document.createElement('div');
    box.className = 'action-box improvement-box';
    box.innerHTML = `
        <div class="action-header">🔄 Improvement Iteration</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Iteration:</span> ${data.iteration}/${data.total}</div>
            <div class="detail-item"><span class="label">Current Score:</span> ${data.current_score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Previous Score:</span> ${data.previous_score.toFixed(2)}</div>
            <div class="detail-item"><span class="label">Improvement:</span> ${(data.current_score - data.previous_score).toFixed(2)}</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Helper: Create collapsible section
 */
function createCollapsibleSection(title, className, collapsed = false) {
    const section = document.createElement('div');
    section.className = className + (collapsed ? ' collapsed' : '');
    
    const header = document.createElement('div');
    header.className = `${className.split('-')[0]}-header collapsible-header`;
    header.innerHTML = `${title} <span class="toggle-btn">[${collapsed ? 'expand' : 'collapse'}]</span>`;
    
    header.onclick = () => {
        section.classList.toggle('collapsed');
        header.querySelector('.toggle-btn').textContent = 
            section.classList.contains('collapsed') ? '[expand]' : '[collapse]';
    };
    
    section.appendChild(header);
    return section;
}

/**
 * Display query start event
 */
export function displayQueryStart(data) {
    // Remove welcome message on first query
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const box = document.createElement('div');
    box.className = 'action-box query-lifecycle-box';
    const queryText = uiManager.escapeHtml(data.query || 'N/A');
    box.innerHTML = `
        <div class="action-header query-collapsible">❓ ${queryText}</div>
        <div class="action-details query-content collapsed">
            <div class="detail-item"><span class="label">Mode:</span> ${data.mode || 'N/A'}</div>
            <div class="detail-item"><span class="label">Status:</span> Processing...</div>
        </div>
    `;
    
    // Add click handler for collapse/expand
    const header = box.querySelector('.query-collapsible');
    const content = box.querySelector('.query-content');
    
    header.onclick = () => {
        content.classList.toggle('collapsed');
    };
    
    uiManager.appendElement(box);
}

/**
 * Display query complete event
 */
export function displayQueryComplete(data) {
    const box = document.createElement('div');
    box.className = 'action-box query-complete-box';
    const processingTime = data.processing_time?.toFixed(2) || 'N/A';
    box.innerHTML = `
        <div class="action-header">✅ Query Completed</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Processing Time:</span> ${processingTime}s</div>
            <div class="detail-item"><span class="label">Status:</span> Success</div>
        </div>
    `;
    uiManager.appendElement(box);
}

/**
 * Display user query (deprecated - now combined with displayQueryStart)
 */
export function displayUserQuery(query) {
    // This function is deprecated but kept for backward compatibility
    // The query is now displayed as part of displayQueryStart
}

/**
 * Display final response
 */
export function displayFinalResponse(result) {
    const box = document.createElement('div');
    box.className = 'action-box response-box';
    
    // Build metadata details
    const metadata = [];
    if (result.processing_time) {
        metadata.push(`<div class="detail-item"><span class="label">⏱️ Processing Time:</span> ${result.processing_time.toFixed(2)}s</div>`);
    }
    if (result.num_docs_found !== undefined) {
        metadata.push(`<div class="detail-item"><span class="label">📄 Documents Found:</span> ${result.num_docs_found}</div>`);
    }
    if (result.response) {
        metadata.push(`<div class="detail-item"><span class="label">📝 Response Length:</span> ${result.response.length} characters</div>`);
    }
    
    box.innerHTML = `
        <div class="action-header">📊 Final Response</div>
        <div class="action-details">
            <div class="detail-item response-text">${uiManager.escapeHtml(result.response)}</div>
            ${metadata.length > 0 ? `<div class="metadata-section">${metadata.join('')}</div>` : ''}
        </div>
    `;
    uiManager.appendElement(box);
}


