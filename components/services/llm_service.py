"""
LLM Service - Unified LLM API client.

Eliminates duplicate LLM calling code across the system.
Provides consistent error handling, retries, and streaming support.
"""

import logging
import time
import requests
from typing import Dict, Any, Optional, Tuple, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """Standardized LLM response structure."""
    text: str
    generation_time: float
    token_count: Optional[int] = None
    finish_reason: Optional[str] = None
    model: Optional[str] = None


class LLMService:
    """
    Centralized LLM API client for all system components.
    
    Provides:
    - Unified API calling with consistent error handling
    - Support for different payload types (message/completion)
    - Retry logic and timeout management
    - Progress callbacks for GUI integration
    - Token counting and usage tracking
    """
    
    def __init__(self, llm_config: Dict[str, Any]):
        """
        Initialize LLM service.
        
        Args:
            llm_config: LLM configuration dictionary
        """
        self.config = llm_config
        self.api_url = llm_config.get("url", "")
        self.model = llm_config.get("model", "")
        self.payload_type = llm_config.get("payload_type", "message")
        self.timeout = llm_config.get("timeout", 300)
        self.headers = llm_config.get("headers", {"Content-Type": "application/json"})
        
        # Cancellation checker (set externally before calls)
        self.cancellation_checker: Optional[Callable[[], bool]] = None
        
        # Statistics
        self.total_calls = 0
        self.total_time = 0.0
        self.total_tokens = 0
    
    def call(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        progress_callback: Optional[Callable[[str], None]] = None,
        action_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> LLMResponse:
        """
        Call LLM with given prompt.
        
        Args:
            prompt: Text prompt to send to LLM
            temperature: Override default temperature
            max_tokens: Override default max tokens
            stream: Enable streaming response (for GUI)
            progress_callback: Optional callback for streaming chunks
            action_callback: Optional callback for action events (request/response data)
            
        Returns:
            LLMResponse object with text and metadata
        """
        start_time = time.time()
        
        # Check for cancellation before making API call
        if self.cancellation_checker and self.cancellation_checker():
            from components.exceptions import QueryCancelledException
            raise QueryCancelledException("Query was cancelled before LLM call")
        
        # Use config defaults if not overridden
        temp = temperature if temperature is not None else self.config.get("temperature", 0.7)
        tokens = max_tokens if max_tokens is not None else self.config.get("max_tokens", 1000)
        
        # Build payload
        payload = self._build_payload(prompt, temp, tokens, stream)
        
        # Emit LLM request action (for app representation)
        if action_callback:
            action_callback({
                "action": "llm_request",
                "data": {
                    "endpoint": self.api_url,
                    "model": self.model,
                    "temperature": temp,
                    "max_tokens": tokens,
                    "prompt": prompt,
                    "payload": payload
                }
            })
        
        try:
            # Make API call
            response = requests.post(
                self.api_url,
                json=payload,
                headers=self.headers,
                timeout=self.timeout,
                stream=True  # Always stream for SSE-based servers
            )
            response.raise_for_status()
            
            # Handle streaming response (SSE format)
            # Note: The streaming server only supports SSE format, not JSON responses
            text = self._handle_streaming_response(response, progress_callback)
            
            generation_time = time.time() - start_time
            
            # Update statistics
            self.total_calls += 1
            self.total_time += generation_time
            
            # Emit LLM response action (for app representation)
            if action_callback:
                action_callback({
                    "action": "llm_response",
                    "data": {
                        "text": text,
                        "generation_time": generation_time,
                        "response_length": len(text),
                        "success": True
                    }
                })
            
            logger.info(f"LLM call successful in {generation_time:.2f}s")
            
            return LLMResponse(
                text=text,
                generation_time=generation_time,
                model=self.model
            )
            
        except requests.exceptions.Timeout:
            logger.error(f"LLM call timeout after {self.timeout}s")
            if action_callback:
                action_callback({
                    "action": "llm_response",
                    "data": {
                        "success": False,
                        "error": f"Timeout after {self.timeout}s"
                    }
                })
            raise TimeoutError(f"LLM request timeout after {self.timeout}s")
        
        except requests.exceptions.RequestException as e:
            logger.error(f"LLM API request failed: {e}")
            if action_callback:
                action_callback({
                    "action": "llm_response",
                    "data": {
                        "success": False,
                        "error": str(e)
                    }
                })
            raise RuntimeError(f"LLM API call failed: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error in LLM call: {e}")
            if action_callback:
                action_callback({
                    "action": "llm_response",
                    "data": {
                        "success": False,
                        "error": str(e)
                    }
                })
            raise
    
    def _build_payload(self, prompt: str, temperature: float, max_tokens: int, stream: bool) -> Dict[str, Any]:
        """Build API payload based on payload type."""
        if self.payload_type == "message":
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            # Add top_p and top_k if configured
            if "top_p" in self.config:
                payload["top_p"] = self.config["top_p"]
            if "top_k" in self.config:
                payload["top_k"] = self.config["top_k"]
            return payload
        else:  # completion style
            return {
                "model": self.model,
                "prompt": prompt,
                "stream": stream,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            }
    
    def _extract_response_text(self, result: Dict[str, Any]) -> str:
        """Extract text from API response based on payload type."""
        if self.payload_type == "message":
            if "choices" in result and len(result["choices"]) > 0:
                return result["choices"][0]["message"]["content"].strip()
            elif "content" in result:
                return result["content"].strip()
        else:  # completion style
            if "response" in result:
                return result["response"].strip()
        
        raise ValueError("Could not extract text from LLM response")
    
    def _handle_streaming_response(self, response, progress_callback: Optional[Callable[[str], None]] = None) -> str:
        """
        Handle plain text streaming response.
        
        The server returns plain text chunks without any wrapper format (no SSE, no JSON).
        Chunks arrive as the model generates them and should be accumulated into full_text.
        """
        full_text = ""
        
        # Iterate over response chunks as they arrive
        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            if chunk:
                # Add chunk to full text
                full_text += chunk
                
                # Call progress callback if provided (for UI updates)
                if progress_callback:
                    progress_callback(chunk)
        
        logger.info(f"Stream completed: received {len(full_text)} characters")
        return full_text
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get service usage statistics (for GUI monitoring).
        
        Returns:
            Dictionary with usage stats
        """
        return {
            "total_calls": self.total_calls,
            "total_time": self.total_time,
            "average_time": self.total_time / self.total_calls if self.total_calls > 0 else 0,
            "total_tokens": self.total_tokens,
            "model": self.model,
            "api_url": self.api_url
        }
    
    def reset_statistics(self) -> None:
        """Reset usage statistics."""
        self.total_calls = 0
        self.total_time = 0.0
        self.total_tokens = 0
        logger.info("LLM service statistics reset")
    
    def generate(self, prompt: str, temperature: Optional[float] = None) -> str:
        """
        Simple generation method for None mode.
        
        Args:
            prompt: Text prompt
            temperature: Optional temperature override
            
        Returns:
            Generated text string
        """
        response = self.call(prompt=prompt, temperature=temperature)
        return response.text
    
    def call_llm(
        self, 
        prompt: str, 
        temperature: Optional[float] = None,
        **kwargs
    ) -> str:
        """
        Alias for generate() - used by FAISS and Full modes.
        
        Args:
            prompt: Text prompt
            temperature: Optional temperature override
            **kwargs: Additional parameters passed to call()
            
        Returns:
            Generated text string
        """
        response = self.call(prompt=prompt, temperature=temperature, **kwargs)
        return response.text
