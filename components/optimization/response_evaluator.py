"""
Response Evaluator - LLM-based response quality assessment.

Uses the same LLM to evaluate response quality with a fast,
low-token evaluation prompt that returns a 0.00-1.00 score.
"""

import logging
import time
import requests
import os
from pathlib import Path
from typing import Dict, Tuple
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax

logger = logging.getLogger(__name__)
console = Console()


class ResponseEvaluator:
    """Evaluates response quality using LLM self-assessment."""
    
    def __init__(self, llm_config: Dict):
        """
        Initialize the evaluator.
        
        Args:
            llm_config: LLM configuration dictionary
        """
        self.llm_config = llm_config
        
        # Load evaluation prompt from file
        prompt_path = Path(__file__).parent.parent.parent / "prompts" / "evaluation.txt"
        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                self.evaluation_prompt_template = f.read()
            logger.info(f"✓ Loaded evaluation prompt from {prompt_path}")
        except Exception as e:
            logger.warning(f"⚠️  Could not load evaluation prompt from {prompt_path}: {e}")
            # Fallback to embedded Finnish prompt
            self.evaluation_prompt_template = """Arvioit tekoälyavustajan vastauksen laatua.

Kysymys: {question}

Haettu konteksti:
{context}

Vastaus:
{response}

Arvioi tämä vastaus asteikolla 0.00 - 1.00 seuraavien kriteerien perusteella:
- Relevanssi kysymykseen (30%)
- Konteksti-informaation hyödyntäminen (30%)
- Selkeys ja johdonmukaisuus (20%)
- Täydellisyys (20%)

Palauta VAIN desimaaliluku väliltä 0.00 - 1.00. Ei mitään muuta.
Pisteet:"""
    
    def evaluate_response(self, question: str, context: str, response: str) -> Tuple[float, float, str]:
        """
        Evaluate response quality using LLM.
        
        Args:
            question: Original user question
            context: Retrieved context documents
            response: Generated response
            
        Returns:
            Tuple of (quality_score 0.0-1.0, evaluation_time in seconds, reasoning text)
        """
        # Format evaluation prompt
        eval_prompt = self.evaluation_prompt_template.format(
            question=question,
            context=context if context else "(Ei kontekstia)",
            response=response if response else "(Ei vastausta)"
        )
        
        # Display the full evaluation prompt using Rich
        console.print("\n")
        console.rule("[bold cyan]📋 FULL EVALUATION PROMPT[/bold cyan]", style="cyan")
        console.print(Panel(eval_prompt, border_style="cyan", expand=False))
        console.rule(style="cyan")
        console.print()
        
        # Call LLM with minimal tokens for fast evaluation
        try:
            start_time = time.time()
            score, reasoning = self._call_llm_evaluator(eval_prompt)
            eval_time = time.time() - start_time
            
            logger.info(f"Response evaluated: score={score:.2f}, time={eval_time:.2f}s")
            logger.info(f"Reasoning: {reasoning}")
            return score, eval_time, reasoning
            
        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            return 0.5, 0.0, "Evaluation failed"  # Return neutral score on failure
    
    def _call_llm_evaluator(self, prompt: str) -> Tuple[float, str]:
        """
        Call LLM for evaluation with reasoning and score.
        
        Args:
            prompt: Evaluation prompt
            
        Returns:
            Tuple of (quality_score 0.0-1.0, reasoning text)
        """
        api_url = self.llm_config["url"]
        payload_type = self.llm_config.get("payload_type", "message")
        
        # Get max_tokens and temperature from config
        max_tokens = self.llm_config.get("max_tokens", 500)
        temperature = self.llm_config.get("temperature", 0.1)
        timeout = self.llm_config.get("timeout", 60)  # Use config timeout or 60s default
        
        console.print(f"[dim]🔧 Evaluation config: max_tokens={max_tokens}, temperature={temperature}, timeout={timeout}s[/dim]")
        
        # Prepare payload for evaluation
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
                text = result["choices"][0]["message"]["content"].strip() if "choices" in result else result.get("content", "Pisteet: 0.5").strip()
            else:
                text = result.get("response", "Pisteet: 0.5").strip()
            
            # Log the raw evaluation response with Rich
            console.print("\n")
            console.rule("[bold yellow]📝 RAW EVALUATION RESPONSE[/bold yellow]", style="yellow")
            console.print(Panel(text, border_style="yellow", expand=False))
            console.rule(style="yellow")
            console.print()
            
            # Parse score and reasoning from response
            score, reasoning = self._parse_score_and_reasoning(text)
            return score, reasoning
            
        except Exception as e:
            logger.error(f"LLM evaluation call failed: {e}")
            return 0.5, "Evaluation failed"  # Neutral score on error
    
    def _parse_score_and_reasoning(self, text: str) -> Tuple[float, str]:
        """
        Parse score and reasoning from LLM response.
        
        Expected format:
        Perustelut: [reasoning text]
        Pisteet: [0.XX]
        
        Args:
            text: LLM response text
            
        Returns:
            Tuple of (score 0.0-1.0, reasoning text)
        """
        try:
            import re
            
            # Extract reasoning (text after "Perustelut:" and before "Pisteet:")
            reasoning_match = re.search(r'Perustelut:\s*(.+?)(?=Pisteet:|$)', text, re.DOTALL | re.IGNORECASE)
            reasoning = reasoning_match.group(1).strip() if reasoning_match else "Ei perustelua"
            
            # Extract score (number after "Pisteet:")
            score_match = re.search(r'Pisteet:\s*(0?\.\d+|1\.0+|[01])', text, re.IGNORECASE)
            if score_match:
                score = float(score_match.group(1))
                score = max(0.0, min(1.0, score))  # Clamp to 0.0-1.0
            else:
                # Fallback: try to find any decimal number in text
                numbers = re.findall(r'0?\.\d+|1\.0+|[01]', text)
                score = float(numbers[0]) if numbers else 0.5
                score = max(0.0, min(1.0, score))
            
            return score, reasoning
            
        except Exception as e:
            logger.error(f"Score/reasoning parsing error: {e}")
            return 0.5, "Parsing failed"
    
    def _parse_score(self, text: str) -> float:
        """
        Parse score from LLM response.
        
        Args:
            text: LLM response text
            
        Returns:
            Score between 0.0 and 1.0
        """
        try:
            # Try to extract first number from text
            import re
            numbers = re.findall(r'0?\.\d+|1\.0+|[01]', text)
            if numbers:
                score = float(numbers[0])
                # Clamp to 0.0-1.0 range
                return max(0.0, min(1.0, score))
            else:
                logger.warning(f"Could not parse score from: {text}")
                return 0.5
        except Exception as e:
            logger.error(f"Score parsing error: {e}")
            return 0.5
