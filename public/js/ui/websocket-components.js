/**
 * WebSocket Display Components
 * Renders WebSocket real-time updates
 */

import { uiManager } from './manager.js';

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
        <div class="action-header">🚀 LLM API Request</div>
        <div class="action-details">
            <div class="detail-item"><span class="label">Endpoint:</span> ${uiManager.escapeHtml(data.endpoint)}</div>
            <div class="detail-item"><span class="label">Model:</span> ${data.model}</div>
            <div class="detail-item"><span class="label">Temperature:</span> ${data.temperature}</div>
            <div class="detail-item"><span class="label">Max Tokens:</span> ${data.max_tokens}</div>
        </div>
    `;
    
    // Add collapsible prompt section
    const promptSection = createCollapsibleSection('📝 Prompt', 'prompt-section');
    const promptContent = document.createElement('pre');
    promptContent.className = 'prompt-content';
    promptContent.textContent = data.prompt;
    promptSection.appendChild(promptContent);
    box.appendChild(promptSection);
    
    // Add collapsible payload section (collapsed by default)
    const payloadSection = createCollapsibleSection('🔧 Raw Payload', 'payload-section', true);
    const payloadContent = document.createElement('pre');
    payloadContent.className = 'payload-content';
    payloadContent.textContent = JSON.stringify(data.payload, null, 2);
    payloadSection.appendChild(payloadContent);
    box.appendChild(payloadSection);
    
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
            <div class="action-header">✅ LLM Response</div>
            <div class="action-details">
                <div class="detail-item"><span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s</div>
                <div class="detail-item"><span class="label">Response Length:</span> ${data.response_length} characters</div>
            </div>
        `;
        
        // Add collapsible response section
        const responseSection = createCollapsibleSection('💬 Full Response', 'response-section');
        const responseContent = document.createElement('div');
        responseContent.className = 'response-text-full';
        responseContent.textContent = data.text;
        responseSection.appendChild(responseContent);
        box.appendChild(responseSection);
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
