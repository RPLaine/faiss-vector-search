/**
 * WebSocket Display Components
 * Renders WebSocket real-time updates
 */

import { uiManager, escapeHtml } from './manager.js';
import { createAccumulatorTable } from './utils/table-builder.js';
import { createCollapsibleCard } from './utils/card-builder.js';
import { formatMarkdown } from '../utils/markdown-formatter.js';

// Threshold attempts accumulator
let thresholdTable = null;

// Temperature test tracking - single card for entire optimization pipeline
let temperatureOptimizationCard = null;

// Improvement iteration tracking - single card for entire improvement pipeline
let improvementPipelineCard = null;

// Current query mode tracking
let currentQueryMode = null;

// Reference to current query card for status updates
let currentQueryCard = null;

// Track document count from retrieval for display in final response
let retrievedDocumentCount = null;

/**
 * Display threshold attempt event
 */
export function displayThresholdAttempt(data) {
    // Update the Vector Search card if it exists
    if (currentRetrievalCard) {
        const { details } = currentRetrievalCard;
        
        // Find or create threshold section
        let thresholdSection = details.querySelector('.threshold-attempts');
        if (!thresholdSection) {
            thresholdSection = createCollapsibleSection('📊 Similarity Threshold', 'threshold-section', true);
            thresholdSection.classList.add('threshold-attempts');
            
            // Create table structure
            const tableContainer = document.createElement('div');
            tableContainer.className = 'threshold-table-container';
            
            const table = document.createElement('table');
            table.className = 'threshold-data-table';
            
            // Table header
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>Threshold</th>
                    <th>Hits</th>
                    <th>Target</th>
                    <th>Status</th>
                </tr>
            `;
            table.appendChild(thead);
            
            // Table body
            const tbody = document.createElement('tbody');
            table.appendChild(tbody);
            
            tableContainer.appendChild(table);
            thresholdSection.appendChild(tableContainer);
            
            // Insert before documents section if it exists, otherwise append
            const docsSection = details.querySelector('.docs-section');
            if (docsSection) {
                details.insertBefore(thresholdSection, docsSection);
            } else {
                details.appendChild(thresholdSection);
            }
        }
        
        // Add row to table
        const tbody = thresholdSection.querySelector('tbody');
        if (tbody) {
            const row = document.createElement('tr');
            row.className = data.target_reached ? 'target-reached' : '';
            row.innerHTML = `
                <td class="threshold-cell">${data.threshold.toFixed(3)}</td>
                <td class="hits-cell">${data.hits}</td>
                <td class="target-cell">${data.target}</td>
                <td class="status-cell">
                    <span class="status-badge ${data.target_reached ? 'success' : 'searching'}">
                        ${data.target_reached ? '✅ Reached' : '🔍 Searching'}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        }
        
        return;
    }
    
    // Fallback to table view if no retrieval card (shouldn't happen in normal flow)
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

// Track current retrieval card for updates
let currentRetrievalCard = null;

/**
 * Display retrieval start event
 */
export function displayRetrievalStart(data) {
    const content = `
        <div class="detail-item"><span class="label">Status:</span> Searching...</div>
        <div class="detail-item"><span class="label">Top K:</span> ${data.top_k}</div>
        <div class="detail-item"><span class="label">Target:</span> ${data.hit_target || 'N/A'} documents</div>
    `;
    
    const { element, details } = createCollapsibleCard({
        title: '🔍 Vector Search',
        className: 'retrieval',
        content,
        collapsed: true
    });
    
    // Store reference for updating
    currentRetrievalCard = { element, details };
    
    uiManager.appendElement(element);
}

/**
 * Display retrieval complete event
 */
export function displayRetrievalComplete(data) {
    // Store document count for final response display
    retrievedDocumentCount = data.num_docs;
    
    // Update existing card instead of creating new one
    if (currentRetrievalCard) {
        const { element, details } = currentRetrievalCard;
        
        // Update header
        const header = element.querySelector('.card-header');
        if (header) {
            header.innerHTML = '✅ Vector Search';
        }
        
        // Update content
        const detailItems = details.querySelectorAll('.detail-item');
        if (detailItems.length >= 1) {
            detailItems[0].innerHTML = `<span class="label">Documents Found:</span> ${data.num_docs}`;
        }
        if (detailItems.length >= 2) {
            detailItems[1].innerHTML = `<span class="label">Time:</span> ${data.time.toFixed(2)}s`;
        }
        if (detailItems.length >= 3) {
            detailItems[2].innerHTML = `<span class="label">Threshold:</span> ${data.threshold_used ? data.threshold_used.toFixed(3) : 'N/A'}`;
        }
        
        // Add documents section if available
        if (data.documents && data.documents.length > 0) {
            const docsSection = createCollapsibleSection('📚 Retrieved Documents', 'docs-section');
            const docsContainer = document.createElement('div');
            docsContainer.className = 'docs-container';
            
            data.documents.forEach((doc, idx) => {
                // Get full content - prioritize 'text' field, then 'content', then stringify
                const docContent = typeof doc === 'string' ? doc : (doc.text || doc.content || JSON.stringify(doc));
                const docItem = document.createElement('div');
                docItem.className = 'doc-item';
                
                const docHeader = document.createElement('div');
                docHeader.className = 'doc-item-header';
                // Only show filename if it exists and is not "unknown"
                const hasValidFilename = doc.filename && doc.filename.toLowerCase() !== 'unknown';
                docHeader.textContent = hasValidFilename ? `${idx + 1}. ${doc.filename}` : `${idx + 1}.`;
                
                if (doc.score !== undefined) {
                    const scoreSpan = document.createElement('span');
                    scoreSpan.className = 'doc-score';
                    scoreSpan.textContent = `Score: ${doc.score.toFixed(3)}`;
                    docHeader.appendChild(scoreSpan);
                }
                
                const docContentDiv = document.createElement('div');
                docContentDiv.className = 'doc-item-content';
                docContentDiv.textContent = docContent;
                
                docItem.appendChild(docHeader);
                docItem.appendChild(docContentDiv);
                docsContainer.appendChild(docItem);
            });
            
            docsSection.appendChild(docsContainer);
            details.appendChild(docsSection);
        }
        
        // Clear reference
        currentRetrievalCard = null;
    } else {
        // Fallback: create new card if no start event occurred
        let content = `
            <div class="detail-item"><span class="label">Documents Found:</span> ${data.num_docs}</div>
            <div class="detail-item"><span class="label">Time:</span> ${data.time.toFixed(2)}s</div>
            <div class="detail-item"><span class="label">Threshold:</span> ${data.threshold_used ? data.threshold_used.toFixed(3) : 'N/A'}</div>
        `;
        
        const { element, details } = createCollapsibleCard({
            title: '✅ Vector Search',
            className: 'retrieval-result',
            content,
            collapsed: false
        });
        
        if (data.documents && data.documents.length > 0) {
            const docsSection = createCollapsibleSection('📚 Retrieved Documents', 'docs-section');
            const docsContainer = document.createElement('div');
            docsContainer.className = 'docs-container';
            
            data.documents.forEach((doc, idx) => {
                // Get full content - prioritize 'text' field, then 'content', then stringify
                const docContent = typeof doc === 'string' ? doc : (doc.text || doc.content || JSON.stringify(doc));
                const docItem = document.createElement('div');
                docItem.className = 'doc-item';
                
                const docHeader = document.createElement('div');
                docHeader.className = 'doc-item-header';
                // Only show filename if it exists and is not "unknown"
                const hasValidFilename = doc.filename && doc.filename.toLowerCase() !== 'unknown';
                docHeader.textContent = hasValidFilename ? `${idx + 1}. ${doc.filename}` : `${idx + 1}.`;
                
                if (doc.score !== undefined) {
                    const scoreSpan = document.createElement('span');
                    scoreSpan.className = 'doc-score';
                    scoreSpan.textContent = `Score: ${doc.score.toFixed(3)}`;
                    docHeader.appendChild(scoreSpan);
                }
                
                const docContentDiv = document.createElement('div');
                docContentDiv.className = 'doc-item-content';
                docContentDiv.textContent = docContent;
                
                docItem.appendChild(docHeader);
                docItem.appendChild(docContentDiv);
                docsContainer.appendChild(docItem);
            });
            
            docsSection.appendChild(docsContainer);
            details.appendChild(docsSection);
        }
        
        uiManager.appendElement(element);
    }
}

/**
 * Display LLM request event
 */
export function displayLLMRequest(data) {
    // Add LLM request details to the query card instead of creating a separate card
    if (currentQueryCard) {
        const queryContent = currentQueryCard.querySelector('.query-content');
        if (queryContent) {
            // Add request parameters section
            const paramsSection = createCollapsibleSection('🚀 Request Parameters', 'params-section');
            const paramsContent = document.createElement('div');
            paramsContent.className = 'params-content';
            paramsContent.innerHTML = `
                <div class="detail-item"><span class="label">Endpoint:</span> ${escapeHtml(data.endpoint)}</div>
                <div class="detail-item"><span class="label">Model:</span> ${data.model}</div>
                <div class="detail-item"><span class="label">Temperature:</span> ${data.temperature}</div>
                <div class="detail-item"><span class="label">Max Tokens:</span> ${data.max_tokens}</div>
            `;
            paramsSection.appendChild(paramsContent);
            queryContent.appendChild(paramsSection);
            
            // Add prompt section
            const promptSection = createCollapsibleSection('📝 Prompt', 'prompt-section');
            const promptContent = document.createElement('pre');
            promptContent.className = 'prompt-content';
            promptContent.textContent = data.prompt;
            promptSection.appendChild(promptContent);
            queryContent.appendChild(promptSection);
            
            // Add payload section
            const payloadSection = createCollapsibleSection('🔧 Raw Payload', 'payload-section');
            const payloadContent = document.createElement('pre');
            payloadContent.className = 'payload-content';
            payloadContent.textContent = JSON.stringify(data.payload, null, 2);
            payloadSection.appendChild(payloadContent);
            queryContent.appendChild(payloadSection);
        }
    }
}

/**
 * Display LLM response event
 */
export function displayLLMResponse(data) {
    // Skip this card in all modes as it's redundant with final response
    // Final response with markdown formatting is shown via displayFinalResponse()
    return;
}

/**
 * Display evaluation start event
 */
export function displayEvaluationStart(data) {
    const content = `<div class="detail-item">${data.message || 'Evaluating response quality...'}</div>`;
    
    const { element } = createCollapsibleCard({
        title: '🎯 Starting Evaluation',
        className: 'evaluation',
        content,
        collapsed: true
    });
    
    uiManager.appendElement(element);
}

/**
 * Display evaluation complete event
 */
export function displayEvaluationComplete(data) {
    const content = `
        <div class="detail-item"><span class="label">Score:</span> ${data.score.toFixed(2)}</div>
        <div class="detail-item"><span class="label">Time:</span> ${data.time.toFixed(2)}s</div>
    `;
    
    const { element } = createCollapsibleCard({
        title: '✅ Evaluation Complete',
        className: 'evaluation-result',
        content,
        collapsed: true
    });
    
    uiManager.appendElement(element);
}

/**
 * Display temperature test event
 */
export function displayTemperatureTest(data) {
    // Create the optimization card on first test
    if (!temperatureOptimizationCard) {
        const content = `<div class="detail-item"><span class="label">Status:</span> Testing temperatures...</div>`;
        
        const { element, details } = createCollapsibleCard({
            title: '🌡️ Temperature Optimization',
            className: 'temperature-optimization',
            content,
            collapsed: false
        });
        
        temperatureOptimizationCard = { element, details, tests: new Map() };
        uiManager.appendElement(element);
    }
    
    // Create a section for this temperature test
    const testSection = createCollapsibleSection(
        `Temperature ${data.temperature.toFixed(2)} (${data.test_number}/${data.total_tests})`,
        `temp-section`,
        true
    );
    
    // Create a container for test content
    const testContainer = document.createElement('div');
    testContainer.className = 'temp-container';
    testSection.appendChild(testContainer);
    
    // Store reference to this test's section and container
    temperatureOptimizationCard.tests.set(data.temperature, { 
        section: testSection, 
        container: testContainer 
    });
    
    // Add to optimization card
    temperatureOptimizationCard.details.appendChild(testSection);
}

/**
 * Display temperature response event
 */
export function displayTemperatureResponse(data) {
    // Find the test section in the optimization card
    if (!temperatureOptimizationCard) {
        console.warn('Temperature optimization card not found');
        return;
    }
    
    const testData = temperatureOptimizationCard.tests.get(data.temperature);
    if (!testData) {
        console.warn(`Temperature ${data.temperature} section not found in optimization card`);
        return;
    }
    
    // Add response content directly to the container (similar to faiss mode documents)
    const responseDiv = document.createElement('div');
    responseDiv.className = 'temp-response';
    
    const responseLabel = document.createElement('div');
    responseLabel.className = 'detail-item';
    responseLabel.innerHTML = `<span class="label">Response:</span>`;
    responseDiv.appendChild(responseLabel);
    
    const responseContent = document.createElement('div');
    responseContent.className = 'response-text markdown-content';
    responseContent.innerHTML = formatMarkdown(data.response);
    responseDiv.appendChild(responseContent);
    
    testData.container.appendChild(responseDiv);
    
    // Add generation time
    const timeInfo = document.createElement('div');
    timeInfo.className = 'detail-item';
    timeInfo.innerHTML = `<span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s`;
    testData.container.appendChild(timeInfo);
}

/**
 * Display temperature evaluation event
 */
export function displayTemperatureEvaluation(data) {
    // Find the test section in the optimization card
    if (!temperatureOptimizationCard) {
        console.warn('Temperature optimization card not found');
        return;
    }
    
    const testData = temperatureOptimizationCard.tests.get(data.temperature);
    if (!testData) {
        console.warn(`Temperature ${data.temperature} section not found in optimization card`);
        return;
    }
    
    // Update the section header with score
    const sectionHeader = testData.section.querySelector('.collapsible-header');
    if (sectionHeader) {
        sectionHeader.textContent = `Temperature ${data.temperature.toFixed(2)} | Score: ${data.score.toFixed(2)}`;
        
        // Add color coding based on score
        const scoreClass = data.score >= 0.8 ? 'score-high' : data.score >= 0.6 ? 'score-medium' : 'score-low';
        sectionHeader.classList.add(scoreClass);
    }
    
    // Add evaluation details to container
    const evalInfo = document.createElement('div');
    evalInfo.className = 'detail-item';
    evalInfo.innerHTML = `<span class="label">Evaluation Time:</span> ${data.evaluation_time.toFixed(2)}s`;
    testData.container.appendChild(evalInfo);
    
    const scoreInfo = document.createElement('div');
    scoreInfo.className = 'detail-item';
    scoreInfo.innerHTML = `<span class="label">Score:</span> ${data.score.toFixed(2)}`;
    testData.container.appendChild(scoreInfo);
    
    // Add reasoning if available
    if (data.reasoning) {
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'detail-item';
        reasoningDiv.innerHTML = `<span class="label">Reasoning:</span>`;
        testData.container.appendChild(reasoningDiv);
        
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-text';
        reasoningContent.textContent = data.reasoning;
        testData.container.appendChild(reasoningContent);
    }
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
    // Create the pipeline card on first iteration
    if (!improvementPipelineCard) {
        const content = `<div class="detail-item"><span class="label">Status:</span> Processing iterations...</div>`;
        
        const { element, details } = createCollapsibleCard({
            title: '🔄 Response Improvement Pipeline',
            className: 'improvement-pipeline',
            content,
            collapsed: false
        });
        
        improvementPipelineCard = { element, details, iterations: new Map() };
        uiManager.appendElement(element);
    }
    
    // Create a section for this iteration
    const iterationSection = createCollapsibleSection(
        `Iteration ${data.iteration} - ${data.action === 'improving' ? '🔧 Improving' : '📊 Evaluating'}`,
        `iteration-section`,
        true
    );
    
    // Create a container for iteration content
    const iterationContainer = document.createElement('div');
    iterationContainer.className = 'iteration-container';
    iterationSection.appendChild(iterationContainer);
    
    // Store reference to this iteration's section and container
    improvementPipelineCard.iterations.set(data.iteration, { 
        section: iterationSection, 
        container: iterationContainer 
    });
    
    // Add to pipeline card
    improvementPipelineCard.details.appendChild(iterationSection);
}

/**
 * Display improvement response event
 */
export function displayImprovementResponse(data) {
    // Find the iteration section in the pipeline card
    if (!improvementPipelineCard) {
        console.warn('Improvement pipeline card not found');
        return;
    }
    
    const iterationData = improvementPipelineCard.iterations.get(data.iteration);
    if (!iterationData) {
        console.warn(`Iteration ${data.iteration} section not found in pipeline card`);
        return;
    }
    
    // Add response content directly to the container (similar to faiss mode documents)
    const responseDiv = document.createElement('div');
    responseDiv.className = 'improvement-response';
    
    const responseLabel = document.createElement('div');
    responseLabel.className = 'detail-item';
    responseLabel.innerHTML = `<span class="label">Response:</span>`;
    responseDiv.appendChild(responseLabel);
    
    const responseContent = document.createElement('div');
    responseContent.className = 'response-text markdown-content';
    responseContent.innerHTML = formatMarkdown(data.response);
    responseDiv.appendChild(responseContent);
    
    iterationData.container.appendChild(responseDiv);
    
    // Add generation time
    const timeInfo = document.createElement('div');
    timeInfo.className = 'detail-item';
    timeInfo.innerHTML = `<span class="label">Generation Time:</span> ${data.generation_time.toFixed(2)}s`;
    iterationData.container.appendChild(timeInfo);
}

/**
 * Display improvement evaluation event
 */
export function displayImprovementEvaluation(data) {
    // Find the iteration section in the pipeline card
    if (!improvementPipelineCard) {
        console.warn('Improvement pipeline card not found');
        return;
    }
    
    const iterationData = improvementPipelineCard.iterations.get(data.iteration);
    if (!iterationData) {
        console.warn(`Iteration ${data.iteration} section not found in pipeline card`);
        return;
    }
    
    // Update the section header with score and status
    const sectionHeader = iterationData.section.querySelector('.collapsible-header');
    if (sectionHeader) {
        const changeIndicator = data.is_improvement ? '✅' : (data.score_change < 0 ? '⚠️' : '➖');
        const scoreChange = data.score_change >= 0 ? `+${data.score_change.toFixed(3)}` : data.score_change.toFixed(3);
        sectionHeader.textContent = `Iteration ${data.iteration} | Score: ${data.score.toFixed(2)} (${scoreChange}) ${changeIndicator}`;
        
        // Add color coding based on improvement status
        if (data.is_improvement) {
            sectionHeader.classList.add('score-high');
        } else if (data.score_change < 0) {
            sectionHeader.classList.add('score-low');
        } else {
            sectionHeader.classList.add('score-medium');
        }
    }
    
    // Add evaluation details to container
    const changeClass = data.is_improvement ? 'positive' : (data.score_change < 0 ? 'negative' : 'neutral');
    const scoreChangeInfo = document.createElement('div');
    scoreChangeInfo.className = 'detail-item';
    scoreChangeInfo.innerHTML = `<span class="label">Score Change:</span> <span class="${changeClass}">${data.score_change >= 0 ? '+' : ''}${data.score_change.toFixed(3)}</span>`;
    iterationData.container.appendChild(scoreChangeInfo);
    
    const statusInfo = document.createElement('div');
    statusInfo.className = 'detail-item';
    statusInfo.innerHTML = `<span class="label">Status:</span> ${data.is_improvement ? 'Improved ✅' : 'No improvement'}`;
    iterationData.container.appendChild(statusInfo);
    
    // Add reasoning if available
    if (data.reasoning) {
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'detail-item';
        reasoningDiv.innerHTML = `<span class="label">Reasoning:</span>`;
        iterationData.container.appendChild(reasoningDiv);
        
        const reasoningContent = document.createElement('div');
        reasoningContent.className = 'reasoning-text';
        reasoningContent.textContent = data.reasoning;
        iterationData.container.appendChild(reasoningContent);
    }
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
function createCollapsibleSection(title, className, collapsed = true) {
    const section = document.createElement('div');
    section.className = className + (collapsed ? ' collapsed' : '');
    
    const header = document.createElement('div');
    header.className = `${className.split('-')[0]}-header collapsible-header`;
    header.textContent = title;
    
    header.onclick = () => {
        section.classList.toggle('collapsed');
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
    
    // Track the current query mode
    currentQueryMode = data.mode;
    
    // Reset document count for new query
    retrievedDocumentCount = null;
    
    // Reset temperature optimization card for new query
    temperatureOptimizationCard = null;
    
    // Reset improvement pipeline card for new query
    improvementPipelineCard = null;
    
    const box = document.createElement('div');
    box.className = 'action-box query-start-box';
    const queryText = escapeHtml(data.query || 'N/A');
    box.innerHTML = `
        <div class="action-header query-collapsible">❓ ${queryText}</div>
        <div class="action-details query-content collapsed">
            <div class="detail-item"><span class="label">Mode:</span> ${data.mode || 'N/A'}</div>
            <div class="detail-item query-status"><span class="label">Status:</span> Processing...</div>
        </div>
    `;
    
    // Add click handler for collapse/expand
    const header = box.querySelector('.query-collapsible');
    const content = box.querySelector('.query-content');
    
    header.onclick = () => {
        content.classList.toggle('collapsed');
    };
    
    // Store reference to query card for status updates
    currentQueryCard = box;
    
    uiManager.appendElement(box);
}

/**
 * Display query complete event
 */
export function displayQueryComplete(data) {
    // Update the query card status to "Completed"
    if (currentQueryCard) {
        const statusElement = currentQueryCard.querySelector('.query-status');
        if (statusElement) {
            const processingTime = data.processing_time?.toFixed(2) || 'N/A';
            statusElement.innerHTML = `<span class="label">Status:</span> Completed (${processingTime}s)`;
        }
    }
    
    // Skip creating separate "Query Completed" card - it's redundant with final response
    // Information is already shown in the query card status above
    return;
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
    // Format the response text with markdown
    const formattedResponse = formatMarkdown(result.response);
    
    // Create the main response content
    const content = `
        <div class="detail-item response-text markdown-content">${formattedResponse}</div>
    `;
    
    const { element, details } = createCollapsibleCard({
        title: '📊 Final Response',
        className: 'final-response',
        content,
        collapsed: false
    });
    
    // Add metadata section with query statistics
    const metadataItems = [];
    
    if (result.processing_time) {
        metadataItems.push(`<div class="detail-item"><span class="label">⏱️ Processing Time:</span> ${result.processing_time.toFixed(2)}s</div>`);
    }
    
    // Only show documents found if NOT in 'none' mode
    // Use retrievedDocumentCount from retrieval event if available, otherwise fall back to result.num_docs_found
    if (currentQueryMode !== 'none') {
        const docsFound = retrievedDocumentCount !== null ? retrievedDocumentCount : result.num_docs_found;
        if (docsFound !== undefined) {
            metadataItems.push(`<div class="detail-item"><span class="label">📄 Documents Found:</span> ${docsFound}</div>`);
        }
    }
    
    if (result.response) {
        metadataItems.push(`<div class="detail-item"><span class="label">📝 Response Length:</span> ${result.response.length} characters</div>`);
    }
    
    // Add metadata as a collapsible section if there are any items
    if (metadataItems.length > 0) {
        const metadataSection = createCollapsibleSection('📊 Statistics', 'metadata-section', true);
        const metadataContent = document.createElement('div');
        metadataContent.className = 'metadata-content';
        metadataContent.innerHTML = metadataItems.join('');
        metadataSection.appendChild(metadataContent);
        details.appendChild(metadataSection);
    }
    
    uiManager.appendElement(element);
}


