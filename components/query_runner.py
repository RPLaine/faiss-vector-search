"""
Query Runner module for the RAG Query System.

This module handles the main interactive query functionality where users can 
continuously input queries and get responses from their RAG system using 
existing FAISS data. This is the primary production interface.
"""

import os
import signal
import sys
import logging
from typing import Optional
from rich.progress import Progress, SpinnerColumn, TextColumn

from .rag_system import RAGSystem
from .index_manager import IndexManager
from .rag_initializer import RAGInitializer
from .optimization import OptimizationCoordinator

logger = logging.getLogger(__name__)


class QueryRunner:
    """Manages interactive query mode for continuous user input."""
    
    def __init__(self, ui_manager, data_dir="files"):
        """Initialize the query runner with UI manager and data directory."""
        self.ui = ui_manager
        self.data_dir = data_dir
        self.rag: Optional[RAGSystem] = None
        self.optimizer: Optional[OptimizationCoordinator] = None
        self.default_mode: Optional[str] = None  # Can be set to override UI mode selection
        
        # Initialize subsystem components
        self.index_manager = IndexManager(ui_manager, data_dir)
        self.rag_initializer = RAGInitializer(ui_manager)
        
        # Set up keyboard interrupt handler
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle keyboard interrupt (Ctrl+C) gracefully."""
        self.ui.print("\n\n[yellow]🛑 Received interrupt signal. Exiting gracefully...[/yellow]")
        sys.exit(0)
    
    def run(self):
        """Main query runner execution flow."""
        try:
            # Check if index regeneration is needed (delegated to IndexManager)
            self.index_manager.check_and_handle_index_regeneration()
            
            # Prepare data directory and create FAISS index if needed
            self.index_manager.validate_and_prepare_data_directory()
            
            # Initialize RAG system
            self.rag = self.rag_initializer.initialize_rag_system(self.data_dir)
            
            # Initialize optimization coordinator if optimization is enabled
            if self.rag and self.rag.config.get("optimization", {}).get("enabled", False):
                try:
                    self.optimizer = OptimizationCoordinator(self.rag, self.rag.config)
                    logger.info("✅ Optimization coordinator initialized")
                except Exception as e:
                    logger.warning(f"⚠️  Could not initialize optimizer: {e}")
                    self.optimizer = None
            
            # Validate RAG system loaded properly
            self._validate_rag_system()
            
            # Display system status
            self._display_system_status()
            
            # Select query mode interactively
            self._select_query_mode()
            
            # Run interactive query loop
            self._run_query_loop()
            
        except KeyboardInterrupt:
            self.ui.print("\n\n[yellow]🛑 Query session interrupted by user[/yellow]")
            return
        except Exception as e:
            self.ui.print(f"[red]❌ Query runner error: {e}[/red]")
            raise
    
    def _validate_rag_system(self):
        """Validate that the RAG system has loaded correctly."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Use RAG initializer to validate the system
        if not self.rag_initializer.validate_rag_system_data(self.rag, self.data_dir):
            raise RuntimeError("RAG system validation failed")
        
        # Display ready status
        self.ui.display_knowledge_base_ready(self.data_dir)
    
    def _display_system_status(self):
        """Display current system status and loaded data information."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        stats = self.rag.get_stats()
        
        # Use UI manager for system status display
        self.ui.display_system_status(stats, self.data_dir)
    
    def _select_query_mode(self):
        """Allow user to select query mode before starting query loop."""
        from rich.table import Table
        from rich import box
        
        self.ui.print("\n")
        self.ui.print("[bold cyan]🎯 Query Mode Selection[/bold cyan]\n")
        
        # Create mode description table
        mode_table = Table(
            title="Available Query Modes",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan"
        )
        mode_table.add_column("Mode", style="yellow", width=12)
        mode_table.add_column("Description", style="white", width=50)
        mode_table.add_column("Pipeline", style="dim", width=30)
        
        mode_table.add_row(
            "1. none",
            "Direct LLM without retrieval",
            "LLM only"
        )
        mode_table.add_row(
            "2. faiss",
            "Dynamic retrieval from FAISS index",
            "Retrieval → LLM"
        )
        mode_table.add_row(
            "3. full",
            "Complete optimized pipeline",
            "Retrieval → Optimization → Improvement"
        )
        
        self.ui.console.print(mode_table)
        self.ui.print()
        
        # Get user selection
        while True:
            choice = self.ui.input(
                "[cyan]Select mode (1-3)[/cyan]",
                default="3"
            ).strip()
            
            mode_map = {
                "1": "none",
                "2": "faiss",
                "3": "full",
                "none": "none",
                "faiss": "faiss",
                "full": "full"
            }
            
            if choice in mode_map:
                self.default_mode = mode_map[choice]
                self.ui.print(f"[green]✅ Selected mode: {self.default_mode}[/green]\n")
                break
            else:
                self.ui.print("[red]Invalid choice. Please select 1, 2, or 3.[/red]")
    
    def _run_query_loop(self):
        """Run the interactive query loop."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Display ready for queries panel with current mode
        if self.default_mode:
            mode_display = {
                'none': '🎯 Direct LLM',
                'faiss': '📚 FAISS Retrieval',
                'full': '⚡ Full Pipeline'
            }
            self.ui.print(f"\n[bold green]✨ Ready for queries in {mode_display.get(self.default_mode, self.default_mode)} mode[/bold green]")
            self.ui.print("[dim]Type your question, or 'quit' to exit[/dim]\n")
        else:
            self.ui.display_ready_for_queries_flexible()
        
        query_count = 0
        
        while True:
            try:
                self.ui.print()
                
                # Get query from user
                query = self.ui.input(
                    "[cyan]🔍 Enter your query[/cyan]",
                    default=""
                ).strip()
                
                # Check for exit commands
                if query.lower() in ['quit', 'exit', 'q']:
                    # Finalize session before exiting
                    self._finalize_session(query_count)
                    self.ui.print("[yellow]👋 Goodbye![/yellow]")
                    break
                
                if not query:
                    self.ui.print("[dim]Please enter a query or 'quit' to exit.[/dim]")
                    continue
                
                # Get context mode selection for this specific query
                # Use default mode if set, otherwise ask user
                if self.default_mode:
                    mode = self.default_mode
                else:
                    mode = self.ui.get_context_mode_choice()
                
                # Use base template (only one available)
                template = "base"
                
                # Process query with interrupt handling
                query_count += 1
                self._process_query(query, template, query_count, mode)
                
                # Ask if user wants to continue
                if not self.ui.confirm("[yellow]❓ Ask another question?[/yellow]", default=True):
                    # Finalize session before exiting
                    self._finalize_session(query_count)
                    break
                    
            except KeyboardInterrupt:
                self.ui.print("\n[yellow]🛑 Query interrupted[/yellow]")
                if self.ui.confirm("[yellow]❓ Continue with new query?[/yellow]", default=True):
                    continue
                else:
                    # Finalize session before exiting
                    self._finalize_session(query_count)
                    break
            except Exception as e:
                self.ui.print(f"[red]❌ Error processing query: {e}[/red]")
                if self.ui.confirm("[yellow]❓ Try another query?[/yellow]", default=True):
                    continue
                else:
                    # Finalize session before exiting
                    self._finalize_session(query_count)
                    break
    

    
    def _process_query(self, query: str, template: str, query_number: int, mode: str):
        """Process a single query with interrupt handling.
        
        Args:
            query: User's question
            template: Template name to use
            query_number: Sequential query number
            mode: Query mode - "faiss", "direct", "optimized", or explicit modes "none", "full"
        """
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Map legacy modes to new mode names
        mode_mapping = {
            "direct": "none",
            "faiss": "faiss",
            "optimized": "full"
        }
        
        # Use mapped mode or keep as-is if already using new names
        query_mode = mode_mapping.get(mode, mode)
        
        # Display query header
        self.ui.display_query_header(query_number, query, template, mode)
        
        try:
            # Process query with progress indicator
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=self.ui.console,
                transient=True
            ) as progress:
                query_task = progress.add_task(f"[yellow]Processing: '{query[:50]}{'...' if len(query) > 50 else ''}'", total=None)
                
                # Use new mode-based query system
                result = self.rag.query(
                    query=query, 
                    mode=query_mode,
                    template_name=template
                )
                
                progress.update(query_task, description="[green]✅ Query completed")
            
            # Display results
            self._display_query_results(query, template, result)
            
        except KeyboardInterrupt:
            self.ui.print("\n[yellow]⚠️ Query processing interrupted[/yellow]")
            raise
        except Exception as e:
            self.ui.print(f"[red]❌ Query processing failed: {e}[/red]")
            import traceback
            traceback.print_exc()
            raise
    
    def _display_query_results(self, query: str, template: str, result: dict):
        """Display the results of a processed query."""
        # Use UI manager for detailed query results display
        context_docs = self.ui.display_detailed_query_results(query, template, result)
        
        # Show context documents if available and user wants to see them
        if context_docs and self.ui.confirm("[yellow]📚 View source documents?[/yellow]", default=False):
            self.ui.display_source_documents(context_docs)
    
    def _finalize_session(self, query_count: int):
        """Finalize the current session and save summary."""
        if self.rag:
            self.rag_initializer.finalize_session(self.rag, query_count)