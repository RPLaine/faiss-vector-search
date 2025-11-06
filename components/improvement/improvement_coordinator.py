"""
Improvement Coordinator Module

Coordinates iterative response improvement by alternating between
evaluation and improvement phases until convergence or degradation.
"""

import logging
from typing import Dict, Any, List, Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from .response_improver import ResponseImprover
from ..optimization.response_evaluator import ResponseEvaluator

logger = logging.getLogger(__name__)


class ImprovementCoordinator:
    """
    Coordinates iterative response improvement process.
    
    Process:
    1. Start with initial response (from optimization)
    2. Evaluate current response
    3. Use evaluation feedback to improve response
    4. Evaluate improved response
    5. If improved, continue; if degraded, stop and use previous best
    6. Stop if score reaches 1.0 or degradation occurs
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the improvement coordinator.
        
        Args:
            config: Full system configuration dictionary
        """
        self.config = config
        self.console = Console()
        
        # Build evaluator config (external_llm + optimization.evaluator)
        opt_config = config.get("optimization", {})
        evaluator_config = config.get("external_llm", {}).copy()
        evaluator_config.update(opt_config.get("evaluator", {}))
        
        self.evaluator = ResponseEvaluator(llm_config=evaluator_config)
        
        # Build improver config (uses standard external_llm for generation)
        # Can override with improvement.improver if it exists
        improvement_config = config.get("improvement", {})
        improver_config = config.get("external_llm", {}).copy()
        improver_config.update(improvement_config.get("improver", {}))
        
        self.improver = ResponseImprover(llm_config=improver_config)
        
        # Improvement loop settings
        self.target_score = improvement_config.get("target_score", 1.0)
        self.max_iterations = 50  # Safety limit to prevent infinite loops
        
    def improve_iteratively(
        self,
        question: str,
        context: str,
        initial_response: str,
        initial_score: Optional[float] = None,
        initial_reasoning: Optional[str] = None,
        temperature: Optional[float] = None,
        json_callback=None
    ) -> Dict[str, Any]:
        """
        Run iterative improvement until convergence or degradation.
        
        Args:
            question: Original user question
            context: Retrieved context documents
            initial_response: Initial response to improve
            initial_score: Initial score (if already evaluated)
            initial_reasoning: Initial reasoning (if already evaluated)
            temperature: Temperature to use for improvement (from optimization, if available)
            json_callback: Optional callback for JSON event emission (web UI)
            
        Returns:
            Dictionary containing:
            - final_response: Best response achieved
            - final_score: Best score achieved
            - improvement_history: List of all iterations
            - iterations_completed: Number of improvement cycles
            - stopped_reason: Why the loop stopped
        """
        logger.info(f"🔄 Starting iterative improvement for question: {question[:50]}...")
        
        self.console.print("\n[bold magenta]🔄 Iterative Improvement Mode[/bold magenta]")
        self.console.print(f"Question: [yellow]{question}[/yellow]")
        self.console.print(f"Target score: {self.target_score}")
        if temperature is not None:
            self.console.print(f"Using optimized temperature: [cyan]{temperature:.2f}[/cyan]")
        self.console.print("[dim]Loop stops when: score ≥ target, score decreases, or no improvement[/dim]\n")
        
        # Track improvement history
        history = []
        
        # Current state
        current_response = initial_response
        current_score = initial_score
        current_reasoning = initial_reasoning
        
        # Best state (fallback if improvement degrades)
        best_response = initial_response
        best_score = initial_score if initial_score is not None else 0.0
        best_reasoning = initial_reasoning if initial_reasoning is not None else ""
        best_iteration = 0
        
        # Evaluate initial response if not already evaluated
        if current_score is None:
            self.console.print("[cyan]📊 Evaluating initial response...[/cyan]\n")
            current_score, eval_time, current_reasoning = self.evaluator.evaluate_response(
                question=question,
                context=context,
                response=current_response
            )
            best_score = current_score
            best_reasoning = current_reasoning
        
        # Record initial state
        history.append({
            "iteration": 0,
            "response": current_response,
            "score": current_score,
            "reasoning": current_reasoning,
            "action": "Initial"
        })
        
        self.console.print(f"[dim]Debug: Added initial state to history (score: {current_score:.4f})[/dim]")
        self.console.print(f"[yellow]📊 Initial Score: {current_score:.2f}[/yellow]\n")
        
        # Check if already perfect
        if current_score >= self.target_score:
            self.console.print(f"[bold green]✅ Initial response already meets target score ({self.target_score:.2f})[/bold green]\n")
            return self._build_result(
                final_response=current_response,
                final_score=current_score,
                history=history,
                stopped_reason="Target score reached on initial response"
            )
        
        # Iterative improvement loop
        stopped_reason = "Max iterations reached (safety limit)"
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=self.console
        ) as progress:
            
            task = progress.add_task(
                f"Improving... (Best: {best_score:.2f})", 
                total=None  # Indeterminate progress - stops on convergence
            )
            
            for iteration in range(1, self.max_iterations + 1):
                progress.update(task, description=f"Iteration {iteration} (Best: {best_score:.2f})")
                
                self.console.print(f"\n[bold cyan]🔄 Iteration {iteration}[/bold cyan]")
                
                # Emit iteration start event
                if json_callback:
                    json_callback({
                        "type": "improvement_iteration",
                        "data": {
                            "iteration": iteration,
                            "action": "improving"
                        }
                    })
                
                # Format evaluation feedback for improvement prompt
                evaluation_feedback = f"Perustelut: {current_reasoning}\nPisteet: {current_score:.2f}"
                
                # Improve response
                self.console.print("[magenta]🔧 Improving response based on feedback...[/magenta]\n")
                try:
                    improved_response, improvement_time = self.improver.improve_response(
                        question=question,
                        context=context,
                        original_response=current_response,
                        evaluation_feedback=evaluation_feedback,
                        temperature=temperature  # Use optimized temperature if available
                    )
                    
                    # Emit response event
                    if json_callback:
                        json_callback({
                            "type": "improvement_response",
                            "data": {
                                "iteration": iteration,
                                "response": improved_response,
                                "generation_time": improvement_time
                            }
                        })
                        
                except Exception as e:
                    logger.error(f"Improvement failed at iteration {iteration}: {e}")
                    stopped_reason = f"Improvement failed: {e}"
                    break
                
                # Emit evaluation start
                if json_callback:
                    json_callback({
                        "type": "improvement_iteration",
                        "data": {
                            "iteration": iteration,
                            "action": "evaluating"
                        }
                    })
                
                # Evaluate improved response
                self.console.print("[cyan]📊 Evaluating improved response...[/cyan]\n")
                improved_score, eval_time, improved_reasoning = self.evaluator.evaluate_response(
                    question=question,
                    context=context,
                    response=improved_response
                )
                
                # Determine if improvement was successful
                score_change = improved_score - current_score
                is_improvement = score_change > 0.001  # Small threshold to avoid floating point issues
                is_same = abs(score_change) <= 0.001  # No meaningful change
                
                # Emit evaluation result event
                if json_callback:
                    json_callback({
                        "type": "improvement_evaluation",
                        "data": {
                            "iteration": iteration,
                            "score": improved_score,
                            "score_change": score_change,
                            "reasoning": improved_reasoning,
                            "is_improvement": is_improvement
                        }
                    })
                
                self.console.print(f"[dim]Debug: current={current_score:.4f}, improved={improved_score:.4f}, change={score_change:+.4f}, is_improvement={is_improvement}, is_same={is_same}[/dim]")
                
                # Display result
                if is_improvement:
                    self.console.print(f"[bold green]✅ Improvement! Score: {current_score:.2f} → {improved_score:.2f} (+{score_change:.2f})[/bold green]\n")
                elif is_same:
                    self.console.print(f"[bold yellow]⚪ No change. Score: {current_score:.2f} → {improved_score:.2f} ({score_change:.2f})[/bold yellow]\n")
                else:
                    self.console.print(f"[bold red]❌ Degradation! Score: {current_score:.2f} → {improved_score:.2f} ({score_change:.2f})[/bold red]\n")
                
                # Record iteration
                history.append({
                    "iteration": iteration,
                    "response": improved_response,
                    "score": improved_score,
                    "reasoning": improved_reasoning,
                    "action": "Improved" if is_improvement else ("No Change" if is_same else "Degraded"),
                    "score_change": score_change
                })
                
                self.console.print(f"[dim]Debug: Added iteration {iteration} to history (action: {'Improved' if is_improvement else ('No Change' if is_same else 'Degraded')}, score: {improved_score:.4f}, change: {score_change:+.4f})[/dim]")
                
                # Check stopping conditions
                if is_same:
                    # No improvement - convergence reached
                    self.console.print(f"[yellow]⚪ No improvement detected. Converged at score {improved_score:.2f}[/yellow]\n")
                    stopped_reason = f"Convergence at iteration {iteration} (no improvement)"
                    break
                
                if not is_improvement:
                    # Degradation - stop and use best so far
                    self.console.print(f"[yellow]⚠️  Response degraded. Stopping and using best response (iteration {best_iteration}, score {best_score:.2f})[/yellow]\n")
                    stopped_reason = f"Degradation detected at iteration {iteration}"
                    break
                
                # Update current and best state
                current_response = improved_response
                current_score = improved_score
                current_reasoning = improved_reasoning
                
                if improved_score > best_score:
                    best_response = improved_response
                    best_score = improved_score
                    best_reasoning = improved_reasoning
                    best_iteration = iteration
                
                # Check if target reached
                if improved_score >= self.target_score:
                    self.console.print(f"[bold green]🎯 Target score ({self.target_score:.2f}) reached![/bold green]\n")
                    stopped_reason = f"Target score reached at iteration {iteration}"
                    break
                
                # No need to advance progress since total=None (indeterminate)
        
        # Don't display table here - let the final summary handle it
        iterations_count = len(history) - 1  # Exclude initial
        self.console.print(f"\n[dim]Debug: History has {len(history)} entries, iterations_completed will be {iterations_count}[/dim]")
        
        return self._build_result(
            final_response=best_response,
            final_score=best_score,
            history=history,
            stopped_reason=stopped_reason
        )
    
    def _display_improvement_progress(self, history: List[Dict[str, Any]], best_iteration: int):
        """
        Display improvement progress in a formatted table.
        
        Args:
            history: List of iteration records
            best_iteration: Iteration number of best result
        """
        self.console.print("\n[bold green]📈 Improvement Progress[/bold green]\n")
        
        # Create progress table
        progress_table = Table(title="Iterative Improvement History")
        progress_table.add_column("Iteration", style="cyan", justify="center")
        progress_table.add_column("Score", style="yellow", justify="center")
        progress_table.add_column("Change", style="magenta", justify="center")
        progress_table.add_column("Action", style="white", justify="center")
        progress_table.add_column("Status", style="green", justify="center")
        
        for record in history:
            iteration = record["iteration"]
            score = record["score"]
            action = record["action"]
            score_change = record.get("score_change", 0.0)
            
            # Format change
            if iteration == 0:
                change_str = "-"
            else:
                change_str = f"{score_change:+.2f}"
            
            # Determine status
            is_best = (iteration == best_iteration)
            status = "🏆 Best" if is_best else ("✓" if action == "Improved" else "✗")
            
            # Style score column based on quality
            score_style = "bold green" if is_best else "yellow"
            
            # Style action column
            if action == "Initial":
                action_style = "cyan"
            elif action == "Improved":
                action_style = "green"
            else:
                action_style = "red"
            
            progress_table.add_row(
                str(iteration),
                f"[{score_style}]{score:.2f}[/{score_style}]",
                change_str,
                f"[{action_style}]{action}[/{action_style}]",
                status
            )
        
        self.console.print(progress_table)
    
    def _build_result(
        self,
        final_response: str,
        final_score: float,
        history: List[Dict[str, Any]],
        stopped_reason: str
    ) -> Dict[str, Any]:
        """
        Build final result dictionary.
        
        Args:
            final_response: Best response text
            final_score: Best score achieved
            history: Complete improvement history
            stopped_reason: Reason for stopping
            
        Returns:
            Result dictionary
        """
        return {
            "final_response": final_response,
            "final_score": final_score,
            "improvement_history": history,
            "iterations_completed": len(history) - 1,  # Exclude initial
            "stopped_reason": stopped_reason
        }
