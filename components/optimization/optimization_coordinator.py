"""
Optimization Coordinator Module

Coordinates the optimization process by managing the interaction between
ResponseEvaluator, AdaptiveOptimizer, and RAGSystem.
"""

import logging
from typing import Dict, Any, List
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

from .response_evaluator import ResponseEvaluator
from .temperature_optimizer import TemperatureOptimizer, ParameterSet

logger = logging.getLogger(__name__)


class OptimizationCoordinator:
    """
    Coordinates the adaptive optimization process.
    
    Manages the optimization loop:
    1. Optimizer suggests parameters
    2. RAG system generates response with those parameters
    3. Evaluator scores the response
    4. Optimizer adjusts based on score
    """
    
    def __init__(self, rag_system, config: Dict[str, Any]):
        """
        Initialize the optimization coordinator.
        
        Args:
            rag_system: RAGSystem instance to optimize
            config: Full system configuration dictionary
        """
        self.rag_system = rag_system
        self.config = config
        
        # Build evaluator with LLM config AND optimization evaluator config
        opt_config = config.get("optimization", {})
        evaluator_config = config.get("external_llm", {}).copy()
        evaluator_config.update(opt_config.get("evaluator", {}))
        
        self.evaluator = ResponseEvaluator(
            llm_config=evaluator_config
        )
        
        # Build optimizer with optimization config
        optimizer_config = {
            "temperature_values": opt_config.get("temperature_values", [0.25, 0.5, 0.75, 1.0, 1.25])
        }
        self.optimizer = TemperatureOptimizer(optimizer_config)
        self.max_iterations = len(optimizer_config["temperature_values"])
        
        self.console = Console()
        
    def optimize_for_query(self, query: str) -> Dict[str, Any]:
        """
        Run optimization for a specific query using the AdaptiveOptimizer.optimize() method.
        
        Args:
            query: User query to optimize for
            
        Returns:
            Dictionary containing:
            - best_parameters: Optimal parameter set
            - best_score: Best score achieved
            - best_response: Best response text
            - optimization_history: List of all attempts
            - final_result: Final query result with best parameters
        """
        logger.info(f"🎯 Starting optimization for query: {query[:50]}...")
        
        self.console.print("\n[bold cyan]🌡️  Temperature Optimization Mode[/bold cyan]")
        self.console.print(f"Query: [yellow]{query}[/yellow]")
        self.console.print(f"Testing {len(self.optimizer.temperature_values)} temperature values: {self.optimizer.temperature_values}\n")
        
        # Create initial parameters from current config
        initial_params = ParameterSet(
            temperature=self.config.get("external_llm", {}).get("temperature", 0.5),
            top_k=self.config.get("retrieval", {}).get("top_k", 10),
            similarity_threshold=self.config.get("retrieval", {}).get("similarity_threshold", 0.55),
            hit_target=self.config.get("retrieval", {}).get("hit_target", 3)
        )
        
        # Track best response and result
        best_response_text = ""
        best_result_dict = None
        all_responses = []  # Track all responses for comparison display
        
        # Define evaluation function that the optimizer will call
        def evaluate_fn(question: str, params: ParameterSet):
            """
            Generate response and evaluate it.
            
            Returns:
                Tuple of (response, context, score)
            """
            # Generate response with these parameters
            result = self._generate_with_parameters(question, params)
            
            if not result or "response" not in result:
                logger.warning(f"⚠️  No response generated")
                return "", "", 0.0
            
            # Extract response and context
            response_text = result["response"]
            documents = result.get("documents", [])
            
            # Build context from documents (they are already strings from search_detailed)
            if documents and len(documents) > 0:
                if isinstance(documents[0], dict):
                    # If documents are dicts, extract content
                    context_used = "\n\n".join([doc.get("content", "") for doc in documents])
                else:
                    # If documents are strings, use directly
                    context_used = "\n\n".join([str(doc) for doc in documents])
            else:
                context_used = ""
            
            # Debug logging with Rich
            self.console.print(f"[dim]📄 Documents found: {len(documents)}[/dim]")
            self.console.print(f"[dim]📝 Context length: {len(context_used)} characters[/dim]")
            self.console.print(f"[dim]💬 Response length: {len(response_text)} characters[/dim]")
            
            # Evaluate the response
            score, eval_time, reasoning = self.evaluator.evaluate_response(
                question=question,
                context=context_used,
                response=response_text
            )
            
            self.console.print(f"[yellow]📊 Score: {score:.2f}[/yellow] [dim](evaluated in {eval_time:.2f}s)[/dim]")
            
            # Track all responses for comparison
            all_responses.append({
                "temperature": params.temperature,
                "response": response_text,
                "score": score,
                "reasoning": reasoning,
                "result": result
            })
            
            # Track best result
            nonlocal best_response_text, best_result_dict
            if score > (best_result_dict.get("score", 0) if best_result_dict else 0):
                best_response_text = response_text
                best_result_dict = result
            
            return response_text, context_used, score
        
        # Run optimization
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=self.console
        ) as progress:
            
            task = progress.add_task("Optimizing...", total=len(self.optimizer.temperature_values))
            
            # This will call evaluate_fn repeatedly
            best_params, history = self.optimizer.optimize(
                question=query,
                initial_params=initial_params,
                evaluate_fn=evaluate_fn
            )
            
            # Update progress for each iteration in history
            for _ in history:
                progress.advance(task)
        
        # Display all response comparisons
        self._display_response_comparisons(all_responses)
        
        # Display optimization results
        self._display_optimization_results(history, best_params)
        
        return {
            "best_parameters": best_params,
            "best_score": best_params.score,
            "best_response": best_response_text,
            "optimization_history": [p.to_dict() for p in history],
            "final_result": best_result_dict,
            "iterations_completed": len(history)
        }
    
    def _generate_with_parameters(self, query: str, parameters: ParameterSet) -> Dict[str, Any]:
        """
        Generate a response using specific parameters.
        
        Args:
            query: User query
            parameters: Parameter set to use
            
        Returns:
            Query result dictionary
        """
        # Temporarily override RAG system parameters
        original_config = self.rag_system.config.copy()
        
        try:
            # Update config with optimization parameters
            self.rag_system.config["external_llm"]["temperature"] = parameters.temperature
            self.rag_system.config["retrieval"]["top_k"] = parameters.top_k
            self.rag_system.config["retrieval"]["similarity_threshold"] = parameters.similarity_threshold
            self.rag_system.config["retrieval"]["hit_target"] = parameters.hit_target
            
            # Generate response
            result = self.rag_system.query(query)
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Error generating response: {e}")
            return {}
        
        finally:
            # Restore original config
            self.rag_system.config = original_config
    
    def _display_response_comparisons(self, all_responses: List[Dict[str, Any]]):
        """
        Display all response comparisons side-by-side before showing final result.
        
        Args:
            all_responses: List of dicts with temperature, response, score, result
        """
        from rich.panel import Panel
        from rich.columns import Columns
        
        self.console.print("\n[bold cyan]🔍 Response Comparison Across Temperatures[/bold cyan]\n")
        
        # Sort by temperature for consistent display
        sorted_responses = sorted(all_responses, key=lambda x: x["temperature"])
        
        for item in sorted_responses:
            temp = item["temperature"]
            response = item["response"]
            score = item["score"]
            reasoning = item.get("reasoning", "Ei perustelua")
            
            # Determine panel style based on score
            if score >= 0.80:
                border_style = "bold green"
                title_style = "bold green"
            elif score >= 0.70:
                border_style = "green"
                title_style = "green"
            elif score >= 0.60:
                border_style = "yellow"
                title_style = "yellow"
            else:
                border_style = "red"
                title_style = "red"
            
            # Create panel content with reasoning
            content = f"[bold cyan]Arviointi:[/bold cyan] {reasoning}\n\n[bold]Vastaus:[/bold]\n{response}"
            
            # Create panel for this response (full text, no truncation)
            title = f"🌡️ Temperature: {temp:.2f} | 📊 Score: {score:.2f}"
            panel = Panel(
                content,
                title=title,
                border_style=border_style,
                title_align="left",
                expand=True
            )
            
            self.console.print(panel)
            self.console.print()  # Add spacing
    
    def _display_optimization_results(self, history: List[ParameterSet], 
                                     best_parameters: ParameterSet):
        """
        Display optimization results in a formatted table.
        
        Args:
            history: List of parameter sets tried
            best_parameters: Best parameter set found
        """
        self.console.print("\n[bold green]✅ Optimization Complete[/bold green]\n")
        
        # Best parameters table
        params_table = Table(title="🏆 Best Temperature Found")
        params_table.add_column("Parameter", style="cyan")
        params_table.add_column("Value", style="yellow")
        params_table.add_column("Score", style="green")
        
        params_table.add_row("Temperature", f"{best_parameters.temperature:.2f}", f"{best_parameters.score:.2f}")
        
        self.console.print(params_table)
        
        # Optimization history table
        if history:
            history_table = Table(title="📈 Temperature Optimization History")
            history_table.add_column("#", style="dim", justify="center")
            history_table.add_column("Temperature", style="cyan", justify="center")
            history_table.add_column("Score", style="yellow", justify="center")
            history_table.add_column("Status", style="magenta", justify="center")
            
            best_score = best_parameters.score
            
            for i, params in enumerate(history, 1):
                is_best = abs(params.score - best_score) < 0.001
                
                status = "🏆 Best" if is_best else "✓"
                score_style = "bold green" if is_best else "yellow"
                
                history_table.add_row(
                    str(i),
                    f"{params.temperature:.2f}",
                    f"[{score_style}]{params.score:.2f}[/{score_style}]",
                    status
                )
            
            self.console.print("\n")
            self.console.print(history_table)
