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

logger = logging.getLogger(__name__)


class QueryRunner:
    """Manages interactive query mode for continuous user input."""
    
    def __init__(self, ui_manager, data_dir="files"):
        """Initialize the query runner with UI manager and data directory."""
        self.ui = ui_manager
        self.data_dir = data_dir
        self.rag: Optional[RAGSystem] = None
        
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
            # Check if index regeneration is needed
            self._handle_index_regeneration()
            
            # Prepare data directory and create FAISS index if needed
            self.index_manager.validate_and_prepare_data_directory()
            
            # Initialize RAG system
            self.rag = self.rag_initializer.initialize_rag_system(self.data_dir)
            
            # Validate RAG system loaded properly
            self._validate_rag_system()
            
            # Display system status
            self._display_system_status()
            
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
    
    def _handle_index_regeneration(self):
        """Check if FAISS index should be regenerated."""
        index_path = os.path.join(self.data_dir, "faiss.index")
        metadata_path = os.path.join(self.data_dir, "metadata.pkl")
        
        # Check if index files exist
        index_exists = os.path.exists(index_path) and os.path.exists(metadata_path)
        
        if index_exists:
            # Ask user if they want to regenerate
            should_regenerate = self.ui.confirm(
                "[yellow]📁 Existing FAISS index found. Regenerate index from documents?[/yellow]",
                default=False
            )
            
            if should_regenerate:
                self.ui.print("[blue]🔄 Regenerating FAISS index...[/blue]")
                # Clear existing index files
                self.index_manager.clear_existing_index()
                # The index will be recreated in validate_and_prepare_data_directory()
            else:
                self.ui.print("[green]✅ Using existing FAISS index[/green]")
        else:
            self.ui.print("[blue]🆕 No existing FAISS index found. Creating new index...[/blue]")
    
    def _display_system_status(self):
        """Display current system status and loaded data information."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        stats = self.rag.get_stats()
        
        # Use UI manager for system status display
        self.ui.display_system_status(stats, self.data_dir)
        
        # Show available templates
        self.ui.display_available_templates()
    
    def _run_query_loop(self):
        """Run the interactive query loop."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Display ready for queries panel (without pre-selecting context mode)
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
                use_context = self._get_context_mode_choice()
                
                # Get template choice
                template = self._get_template_choice()
                
                # Process query with interrupt handling
                query_count += 1
                self._process_query(query, template, query_count, use_context)
                
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
    
    def _get_context_mode_choice(self):
        """Get context mode choice for each individual query."""
        self.ui.print("\n[bold cyan]📋 Select query mode for this question:[/bold cyan]")
        
        choice = self.ui.input(
            "[cyan]Choose mode: [1] FAISS Enhanced (with document context) | [2] Direct LLM (no context)[/cyan]",
            default="1"
        ).strip()
        
        if choice == "2":
            self.ui.print("[yellow]🤖 Using Direct LLM mode (no document context)[/yellow]")
            return False
        else:
            self.ui.print("[green]📚 Using FAISS Enhanced mode (with document context)[/green]")
            return True
    
    def _get_template_choice(self):
        """Get template choice from user."""
        return self.ui.input(
            "[cyan]📝 Select template[/cyan]",
            default="basic_rag"
        )
    
    def _process_query(self, query: str, template: str, query_number: int, use_context: bool):
        """Process a single query with interrupt handling."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Display query header
        self.ui.display_query_header(query_number, query, template, use_context)
        
        try:
            # Process query with progress indicator
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=self.ui.console,
                transient=True
            ) as progress:
                query_task = progress.add_task(f"[yellow]Processing: '{query[:50]}{'...' if len(query) > 50 else ''}'", total=None)
                
                # This is where the actual RAG query happens
                result = self.rag.query(question=query, template_name=template, use_context=use_context)
                
                progress.update(query_task, description="[green]✅ Query completed")
            
            # Display results
            self._display_query_results(query, template, result)
            
        except KeyboardInterrupt:
            self.ui.print("\n[yellow]⚠️ Query processing interrupted[/yellow]")
            raise
        except Exception as e:
            self.ui.print(f"[red]❌ Query processing failed: {e}[/red]")
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