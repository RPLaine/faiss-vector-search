/**
 * Display Components Module
 * Renders different types of content to the UI
 */

import { uiManager } from './manager.js';
import { displayFinalResponse } from './websocket-components.js';
import { createStaticTable } from './utils/table-builder.js';

/**
 * Display query response
 */
export function displayResponse(result) {
    // Display response in card format
    displayFinalResponse(result);
    
    // Display additional sections
    if (result.config_params) {
        displayConfiguration(result.config_params);
    }
    if (result.context_docs && result.context_docs.length > 0) {
        displaySourceDocuments(result.context_docs);
    }
    if (result.threshold_stats) {
        displayThresholdProgression(result.threshold_stats);
    }

    uiManager.scrollToBottom();
}

/**
 * Display configuration section
 */
export function displayConfiguration(config) {
    const configSection = document.createElement('div');
    configSection.className = 'config-section';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = '⚙️  Configuration';
    configSection.appendChild(title);
    
    const configGrid = document.createElement('div');
    configGrid.className = 'config-grid';
    
    const configItems = [
        { label: 'LLM Model', value: config.llm_model },
        { label: 'Max Tokens', value: config.max_tokens },
        { label: 'Temperature', value: config.temperature },
        { label: 'Embedding Model', value: config.embedding_model },
        { label: 'Dimensions', value: config.dimension },
        { label: 'Top K', value: config.top_k },
        { label: 'Similarity Threshold', value: config.similarity_threshold },
        { label: 'Max Context Length', value: config.max_context_length },
        { label: 'Index Type', value: config.index_type }
    ];
    
    if (config.hit_target && config.hit_target !== 'N/A') {
        configItems.push({ label: 'Hit Target', value: config.hit_target });
        configItems.push({ label: 'Step Size', value: config.step });
    }
    
    configItems.forEach(item => {
        if (item.value && item.value !== 'N/A') {
            const configItem = document.createElement('div');
            configItem.className = 'config-item';
            configItem.innerHTML = `<span class="config-label">${item.label}:</span> <span class="config-value">${item.value}</span>`;
            configGrid.appendChild(configItem);
        }
    });
    
    configSection.appendChild(configGrid);
    uiManager.appendElement(configSection);
}

/**
 * Display source documents
 */
export function displaySourceDocuments(docs) {
    const docsSection = document.createElement('div');
    docsSection.className = 'docs-section';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = '📚 Source Documents';
    docsSection.appendChild(title);
    
    docs.forEach((doc, index) => {
        const docBox = document.createElement('div');
        docBox.className = 'source-document';
        
        let content, filename;
        if (typeof doc === 'object') {
            content = doc.content || JSON.stringify(doc);
            filename = doc.filename || `Document ${index + 1}`;
        } else {
            content = doc;
            filename = `Document ${index + 1}`;
        }
        
        const docTitle = document.createElement('div');
        docTitle.className = 'doc-title';
        docTitle.textContent = filename;
        
        const docContent = document.createElement('div');
        docContent.className = 'doc-content';
        docContent.textContent = content;
        
        docBox.appendChild(docTitle);
        docBox.appendChild(docContent);
        docsSection.appendChild(docBox);
    });
    
    uiManager.appendElement(docsSection);
}

/**
 * Display threshold progression
 */
export function displayThresholdProgression(stats) {
    const table = createStaticTable({
        title: '🎯 Dynamic Threshold Progression',
        className: 'threshold-table',
        columns: [
            { key: 'iteration', label: 'Iteration' },
            { 
                key: 'threshold', 
                label: 'Threshold',
                format: v => v.toFixed(3)
            },
            { key: 'hits', label: 'Hits' },
            { 
                key: 'status', 
                label: 'Status',
                format: (v) => {
                    const icon = v === 'success' ? '✅' : v === 'failed' ? '❌' : '🔄';
                    return `${icon} ${v}`;
                }
            }
        ],
        data: stats.progression
    });
    
    uiManager.appendElement(table);
}

/**
 * Show help message
 */
export function showHelp() {
    uiManager.appendOutput('Available commands:', 'system');
    uiManager.appendOutput('  clear    - Clear the terminal', 'info');
    uiManager.appendOutput('  help     - Show this help message', 'info');
    uiManager.appendOutput('  full     - Set mode to Full (optimization + improvement)', 'info');
    uiManager.appendOutput('  faiss    - Set mode to FAISS (standard retrieval)', 'info');
    uiManager.appendOutput('  none     - Set mode to None (direct LLM, no retrieval)', 'info');
    uiManager.appendOutput('  [query]  - Ask a question to the RAG system', 'info');
    uiManager.appendOutput('', '');
    uiManager.appendOutput('Modes:', 'system');
    uiManager.appendOutput('  Full     - FAISS retrieval + temperature optimization + improvement', 'info');
    uiManager.appendOutput('  FAISS    - Standard FAISS retrieval only (default)', 'info');
    uiManager.appendOutput('  None     - Direct LLM query without retrieval or context', 'info');
}
