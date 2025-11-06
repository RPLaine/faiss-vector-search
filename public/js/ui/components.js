/**
 * Display Components Module
 * Renders different types of content to the UI
 */

import { uiManager } from './manager.js';

/**
 * Display query response
 */
export function displayResponse(result) {
    // Add separator before response
    uiManager.appendOutput(`\n${uiManager.createSeparator('─')}`, 'system');
    uiManager.appendOutput(`📊 RESULTS`, 'system');
    uiManager.appendOutput(`${uiManager.createSeparator('─')}\n`, 'system');
    
    // Main response
    uiManager.appendOutput(`Response:\n${result.response}`, 'response');

    // Build metadata array
    const metadata = [];
    
    if (result.processing_time) {
        metadata.push(`⏱️  Processing Time: ${result.processing_time.toFixed(2)}s`);
    }
    if (result.num_docs_found !== undefined) {
        metadata.push(`📄 Documents Found: ${result.num_docs_found}`);
    }
    if (result.response) {
        metadata.push(`📝 Response Length: ${result.response.length} characters`);
    }
    if (result.optimization_applied) {
        metadata.push(`🎯 Optimization Score: ${result.optimization_score?.toFixed(2)}`);
    }
    if (result.improvement_applied) {
        metadata.push(`🔄 Improvement Iterations: ${result.improvement_iterations}`);
    }
    
    uiManager.appendMetadata(metadata);
    
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
    const thresholdSection = document.createElement('div');
    thresholdSection.className = 'threshold-section';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = '🎯 Dynamic Threshold Progression';
    thresholdSection.appendChild(title);
    
    const table = document.createElement('table');
    table.className = 'threshold-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Iteration</th>
            <th>Threshold</th>
            <th>Hits</th>
            <th>Status</th>
        </tr>
    `;
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    stats.progression.forEach(item => {
        const row = document.createElement('tr');
        const statusIcon = item.status === 'success' ? '✅' : 
                          item.status === 'failed' ? '❌' : '🔄';
        row.innerHTML = `
            <td>${item.iteration}</td>
            <td>${item.threshold.toFixed(3)}</td>
            <td>${item.hits}</td>
            <td>${statusIcon} ${item.status}</td>
        `;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    thresholdSection.appendChild(table);
    uiManager.appendElement(thresholdSection);
}

/**
 * Show help message
 */
export function showHelp() {
    uiManager.appendOutput('Available commands:', 'system');
    uiManager.appendOutput('  clear    - Clear the terminal', 'info');
    uiManager.appendOutput('  help     - Show this help message', 'info');
    uiManager.appendOutput('  [query]  - Ask a question to the RAG system', 'info');
    uiManager.appendOutput('', '');
    uiManager.appendOutput('Modes:', 'system');
    uiManager.appendOutput('  Optimize - Use temperature optimization', 'info');
    uiManager.appendOutput('  FAISS    - Standard FAISS retrieval (default)', 'info');
    uiManager.appendOutput('  None     - Direct LLM query without context', 'info');
}
