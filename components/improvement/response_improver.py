"""
Response Improver - Uses LLM to iteratively improve responses.

Takes an original response and evaluation feedback, then generates
an improved version using the improvement prompt.
"""

import logging
import time
import requests
from pathlib import Path
from typing import Dict, Tuple, Optional
from rich.console import Console
from rich.panel import Panel

logger = logging.getLogger(__name__)
console = Console()


class ResponseImprover:
    """Improves response quality using LLM with evaluation feedback."""
    
    def __init__(self, llm_config: Dict):
        """
        Initialize the improver.
        
        Args:
            llm_config: LLM configuration dictionary
        """
        self.llm_config = llm_config
        
        # Load improvement prompt from file
        prompt_path = Path(__file__).parent.parent.parent / "prompts" / "improvement" / "prompt.txt"
        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                self.improvement_prompt_template = f.read()
            logger.info(f"✓ Loaded improvement prompt from {prompt_path}")
        except Exception as e:
            logger.error(f"❌ Could not load improvement prompt from {prompt_path}: {e}")
            raise RuntimeError(f"Improvement prompt is required but could not be loaded: {e}")
    
    def improve_response(
        self, 
        question: str, 
        context: str, 
        original_response: str,
        evaluation_feedback: str,
        temperature: Optional[float] = None
    ) -> Tuple[str, float]:
        """
        Improve response using LLM based on evaluation feedback.
        
        Args:
            question: Original user question
            context: Retrieved context documents
            original_response: Original response to improve
            evaluation_feedback: Evaluation reasoning and score
            temperature: Temperature to use (if None, uses config value)
            
        Returns:
            Tuple of (improved_response, generation_time in seconds)
        """
        # Format improvement prompt
        improvement_prompt = self.improvement_prompt_template.format(
            question=question,
            context=context if context else "(Ei kontekstia)",
            response=original_response if original_response else "(Ei vastausta)",
            evaluation_feedback=evaluation_feedback if evaluation_feedback else "(Ei palautetta)"
        )
        
        # Display the improvement prompt using Rich
        console.print("\n")
        console.rule("[bold magenta]🔧 IMPROVEMENT PROMPT[/bold magenta]", style="magenta")
        console.print(Panel(
            improvement_prompt[:2000] + "..." if len(improvement_prompt) > 2000 else improvement_prompt,
            border_style="magenta", 
            expand=False
        ))
        console.rule(style="magenta")
        console.print()
        
        # Call LLM to generate improved response
        try:
            start_time = time.time()
            improved_response = self._call_llm_improver(improvement_prompt, temperature)
            generation_time = time.time() - start_time
            
            logger.info(f"Response improved in {generation_time:.2f}s")
            
            # Display improved response
            console.print("\n")
            console.rule("[bold green]✨ IMPROVED RESPONSE[/bold green]", style="green")
            console.print(Panel(improved_response, border_style="green", expand=False))
            console.rule(style="green")
            console.print()
            
            return improved_response, generation_time
            
        except Exception as e:
            logger.error(f"Improvement failed: {e}")
            # Return original response if improvement fails
            return original_response, 0.0
    
    def _call_llm_improver(self, prompt: str, temperature_override: Optional[float] = None) -> str:
        """
        Call LLM for response improvement.
        
        Args:
            prompt: Improvement prompt
            temperature_override: Temperature to use (overrides config if provided)
            
        Returns:
            Improved response text
        """
        api_url = self.llm_config["url"]
        payload_type = self.llm_config.get("payload_type", "message")
        
        # Use provided temperature or fall back to config
        max_tokens = self.llm_config.get("max_tokens", 1000)
        temperature = temperature_override if temperature_override is not None else self.llm_config.get("temperature", 0.7)
        timeout = self.llm_config.get("timeout", 300)
        
        console.print(f"[dim]🔧 Improvement config: max_tokens={max_tokens}, temperature={temperature:.2f}, timeout={timeout}s[/dim]")
        
        # Prepare payload for improvement
        if payload_type == "message":
            payload = {
                "model": self.llm_config["model"],
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
        else:
            payload = {
                "model": self.llm_config["model"],
                "prompt": prompt,
                "stream": False,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature
                }
            }
        
        try:
            headers = self.llm_config.get("headers", {"Content-Type": "application/json"})
            response = requests.post(
                api_url,
                json=payload,
                headers=headers,
                timeout=timeout
            )
            response.raise_for_status()
            result = response.json()
            
            # Extract response text
            if payload_type == "message":
                text = result["choices"][0]["message"]["content"].strip() if "choices" in result else result.get("content", "").strip()
            else:
                text = result.get("response", "").strip()
            
            if not text:
                raise ValueError("Empty response from LLM")
            
            return text
            
        except Exception as e:
            logger.error(f"LLM improvement call failed: {e}")
            raise
