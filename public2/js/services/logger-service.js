/**
 * Logger Service
 * 
 * Handles application logging with formatting.
 * Encapsulates console output for LLM actions and other events.
 */

export class LoggerService {
    constructor() {
        this.styles = {
            llmAction: 'color: #10b981; font-weight: bold;',
            request: 'color: #3b82f6; font-weight: bold;',
            response: 'color: #10b981; font-weight: bold;'
        };
    }
    
    /**
     * Log LLM action with formatted details
     */
    logLLMAction(data) {
        if (!data.action || !data.action.startsWith('llm_')) {
            return;
        }
        
        console.group(`%c[LLM ${data.action}]`, this.styles.llmAction);
        
        if (data.action === 'llm_request') {
            this.logLLMRequest(data);
        } else if (data.action === 'llm_response') {
            this.logLLMResponse(data);
        }
        
        console.groupEnd();
    }
    
    /**
     * Log LLM request details
     */
    logLLMRequest(data) {
        console.log(`%cREQUEST DETAILS:`, this.styles.request);
        console.log('Endpoint:', data.data?.endpoint);
        console.log('Model:', data.data?.model);
        console.log('Temperature:', data.data?.temperature);
        console.log('Max Tokens:', data.data?.max_tokens);
        
        if (data.data?.prompt) {
            const promptPreview = data.data.prompt.substring(0, 200) + '...';
            console.log('Prompt (first 200 chars):', promptPreview);
        }
        
        if (data.agent_id) {
            console.log('Agent ID:', data.agent_id);
        }
        if (data.task_id) {
            console.log('Task ID:', data.task_id);
        }
    }
    
    /**
     * Log LLM response details
     */
    logLLMResponse(data) {
        console.log(`%cRESPONSE DETAILS:`, this.styles.response);
        console.log('Success:', data.data?.success);
        
        if (data.data?.generation_time) {
            console.log('Generation Time:', data.data.generation_time.toFixed(2) + 's');
        }
        
        if (data.data?.response_length) {
            console.log('Response Length:', data.data.response_length, 'characters');
        }
        
        if (data.data?.error) {
            console.error('Error:', data.data.error);
        }
    }
    
    /**
     * Log general info message
     */
    info(message, ...args) {
        console.log(`[App] ${message}`, ...args);
    }
    
    /**
     * Log error message
     */
    error(message, ...args) {
        console.error(`[App] ${message}`, ...args);
    }
    
    /**
     * Log warning message
     */
    warn(message, ...args) {
        console.warn(`[App] ${message}`, ...args);
    }
}
