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
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich import box

from .rag_system import RAGSystem

logger = logging.getLogger(__name__)


class QueryRunner:
    """Manages interactive query mode for continuous user input."""
    
    def __init__(self, ui_manager, data_dir="files"):
        """Initialize the query runner with UI manager and data directory."""
        self.ui = ui_manager
        self.data_dir = data_dir
        self.rag: Optional[RAGSystem] = None
        
        # Set up keyboard interrupt handler
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle keyboard interrupt (Ctrl+C) gracefully."""
        self.ui.print("\n\n[yellow]🛑 Received interrupt signal. Exiting gracefully...[/yellow]")
        sys.exit(0)
    
    def run(self):
        """Main query runner execution flow."""
        try:
            # Validate data directory
            self._validate_data_directory()
            
            # Initialize RAG system
            self._initialize_rag_system()
            
            # Load existing FAISS data
            self._load_existing_data()
            
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
    
    def _validate_data_directory(self):
        """Validate data directory and ensure fresh index creation from files."""
        # Always ensure data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Always create fresh index from files directory
        self.ui.print(Panel.fit(
            "[bold yellow]🔄 Creating fresh FAISS index from files directory...[/bold yellow]\n"
            "[dim]Loading documents from 'files' directory and building new index...[/dim]",
            border_style="yellow",
            title="[bold yellow]Index Creation[/bold yellow]"
        ))
        self._create_initial_faiss_files()
        self._files_just_created = True  # Flag to avoid reloading
    
    def _initialize_rag_system(self):
        """Initialize the RAG system with progress indicator."""
        self.ui.print(Panel.fit(
            f"[bold cyan]🔧 Initializing RAG Query System[/bold cyan]\n"
            f"[dim]Loading from '{self.data_dir}' directory...[/dim]",
            border_style="cyan"
        ))
        
        with self.ui.show_progress("[cyan]Loading RAG system...") as progress:
            init_task = progress.add_task("[cyan]Loading RAG system...", total=None)
            
            # Create config for the specific data directory if not using default
            if self.data_dir != "files":
                import json
                # Load original config
                with open("config.json", 'r', encoding='utf-8') as f:
                    config = json.load(f)
                
                # Update paths to use our data directory
                config["index"]["save_path"] = os.path.join(self.data_dir, "faiss.index")
                config["index"]["metadata_path"] = os.path.join(self.data_dir, "metadata.pkl")
                
                # Save temporary config
                temp_config_path = "temp_query_config.json"
                with open(temp_config_path, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2)
                
                # Initialize RAG system with custom config
                self.rag = RAGSystem(config_path=temp_config_path)
                
                # Clean up temporary config
                os.remove(temp_config_path)
            else:
                # Use default config for files directory
                self.rag = RAGSystem()
            
            # Create initial session
            if self.rag.get_session_manager():
                session_dir = self.rag.create_new_session()
                if session_dir:
                    progress.update(init_task, description=f"[yellow]📁 Session created: {session_dir.name}")
            
            progress.update(init_task, description="[green]✅ RAG system ready")
    
    def _load_existing_data(self):
        """Validate that the RAG system has loaded the correct data."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Skip any loading if we just created the files (to avoid duplication)
        if hasattr(self, '_files_just_created') and self._files_just_created:
            return
        
        # Just display status - no additional loading needed since RAG system 
        # was initialized with correct paths
        self.ui.print(Panel.fit(
            f"[bold green]📁 Knowledge Base Ready[/bold green]\n"
            f"[dim]Using FAISS index and metadata from '{self.data_dir}' directory[/dim]",
            border_style="green"
        ))
    
    def _display_system_status(self):
        """Display current system status and loaded data information."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        stats = self.rag.get_stats()
        
        # Display system status
        status_table = self.ui.create_info_table(
            title="🎯 RAG System Status",
            box_style=box.ROUNDED,
            title_style="bold green",
            header_style="bold cyan"
        )
        status_table.add_column("Component", style="cyan", no_wrap=True)
        status_table.add_column("Status", style="green", justify="center")
        status_table.add_column("Details", style="white")
        
        status_table.add_row(
            "🧠 Embedding Model", 
            "✅ Ready", 
            f"all-MiniLM-L6-v2 ({stats.get('embedding_dimension', 'N/A')}D)"
        )
        status_table.add_row(
            "🔍 Vector Index", 
            "✅ Loaded", 
            f"{stats.get('index_type', 'FAISS')} from {self.data_dir}/"
        )
        status_table.add_row(
            "🌐 External LLM", 
            "🔗 Connected", 
            f"{stats.get('external_llm_model', 'N/A')} via API"
        )
        status_table.add_row(
            "📊 Documents", 
            "✅ Ready", 
            f"{stats['total_documents']} documents available for queries"
        )
        
        self.ui.print(status_table)
        self.ui.print()
        
        # Show available templates
        self._display_available_templates()
    
    def _display_available_templates(self):
        """Display available query templates."""
        templates_table = self.ui.create_info_table(
            title="📝 Available Query Templates",
            box_style=box.SIMPLE,
            header_style="bold yellow"
        )
        templates_table.add_column("Template", style="cyan")
        templates_table.add_column("Description", style="white")
        
        # Default templates
        templates = [
            ("basic_rag", "Basic question-answering format"),
            ("detailed_rag", "Detailed explanations with context"),
            ("technical_rag", "Technical and precise responses"),
            ("concise_rag", "Brief and concise answers")
        ]
        
        for template, description in templates:
            template_path = f"prompts/{template}.txt"
            if os.path.exists(template_path):
                templates_table.add_row(template, description)
        
        self.ui.print(templates_table)
        self.ui.print()
    
    def _run_query_loop(self):
        """Run the interactive query loop."""
        if self.rag is None:
            raise RuntimeError("RAG system not initialized")
        
        # Get context mode selection at the start
        use_context = self.ui.display_context_mode_selection()
        
        self.ui.print(Panel.fit(
            "[bold blue]🚀 RAG Query Interface[/bold blue]\n"
            f"[yellow]Context Mode: {'FAISS Enhanced' if use_context else 'Direct LLM'}[/yellow]\n"
            "[dim]Enter queries to search your knowledge base. Type 'quit' or 'exit' to stop.[/dim]\n"
            "[dim]Press Ctrl+C at any time to interrupt.[/dim]",
            border_style="blue",
            title="[bold cyan]Ready for Queries[/bold cyan]"
        ))
        
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
        query_panel = Panel.fit(
            f"[bold white]Query #{query_number}:[/bold white] [cyan]{query}[/cyan]\n"
            f"[dim]Template: {template} | Context: {'FAISS Enhanced' if use_context else 'Direct LLM'}[/dim]",
            border_style="cyan",
            title=f"[bold cyan]Processing Query[/bold cyan]",
            title_align="left"
        )
        self.ui.print(query_panel)
        
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
        # Display results summary
        results_table = Table(
            title="📊 Query Results",
            box=box.SIMPLE_HEAD,
            show_header=True,
            header_style="bold blue"
        )
        results_table.add_column("Metric", style="cyan")
        results_table.add_column("Value", style="green")
        
        results_table.add_row("Documents Found", str(result.get('num_docs_found', 0)))
        results_table.add_row("Template Used", template)
        results_table.add_row("Response Length", f"{len(result.get('response', ''))} characters")
        
        # Add processing time if available
        if 'processing_time' in result:
            processing_time = result['processing_time']
            results_table.add_row("Processing Time", f"{processing_time:.2f} seconds")
        
        self.ui.print(results_table)
        
        # Display LLM response
        if result.get('response'):
            response_panel = Panel(
                result['response'],
                title="[bold green]🤖 Response[/bold green]",
                border_style="green",
                padding=(1, 2)
            )
            self.ui.print(response_panel)
        
        # Show context documents if available and user wants to see them
        if result.get('context_docs') and self.ui.confirm("[yellow]📚 View source documents?[/yellow]", default=False):
            self.ui.print("[bold yellow]📚 Source Documents:[/bold yellow]")
            for i, doc in enumerate(result['context_docs'], 1):
                # Handle both old format (string) and new format (dict with metadata)
                if isinstance(doc, dict):
                    content = doc.get('content', str(doc))
                    filename = doc.get('filename', f'Document {i}')
                    doc_preview = content  # Show full content without truncation
                    title = f"[bold cyan]{filename}[/bold cyan]"
                else:
                    # Fallback for old format
                    doc_preview = doc  # Show full content without truncation
                    title = f"[bold cyan]Source {i}[/bold cyan]"
                
                doc_panel = Panel(
                    doc_preview,
                    title=title,
                    border_style="dim",
                    padding=(0, 1)
                )
                self.ui.print(doc_panel)
    
    def _create_initial_faiss_files(self):
        """Create initial FAISS files using documents from the files directory."""
        import json
        import glob
        from pathlib import Path
        
        try:
            # Ensure data directory exists
            os.makedirs(self.data_dir, exist_ok=True)
            
            # Clear any existing FAISS files to ensure fresh start
            index_file = os.path.join(self.data_dir, "faiss.index")
            metadata_file = os.path.join(self.data_dir, "metadata.pkl")
            
            if os.path.exists(index_file):
                os.remove(index_file)
                self.ui.print("[dim]🗑️ Removed existing FAISS index[/dim]")
            if os.path.exists(metadata_file):
                os.remove(metadata_file)
                self.ui.print("[dim]🗑️ Removed existing metadata[/dim]")
            
            # Load documents from files directory
            files_dir = Path("files")
            documents = []
            processed_files = []
            
            if not files_dir.exists():
                raise FileNotFoundError("Files directory 'files' not found. Please create it and add your documents.")
            
            # Process all text files in the files directory
            text_extensions = ["*.txt", "*.md", "*.text"]
            document_contents = []  # For embedding
            document_metadata = []  # For storage with filenames
            
            for pattern in text_extensions:
                for file_path in files_dir.glob(pattern):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read().strip()
                            if content:  # Only add non-empty files
                                # Store content for embedding
                                document_contents.append(content)
                                # Store metadata separately
                                document_metadata.append({
                                    "content": content,
                                    "filename": file_path.name,
                                    "file_path": str(file_path),
                                    "size": len(content)
                                })
                                processed_files.append(file_path.name)
                    except Exception as e:
                        self.ui.print(f"[yellow]⚠️ Warning: Could not read {file_path.name}: {e}[/yellow]")
            
            if not document_contents:
                raise ValueError("No readable text files found in 'files' directory. Please add .txt, .md, or .text files with UTF-8 content.")
            
            # Save processed files info for reference
            files_info = {
                "processed_files": processed_files,
                "total_documents": len(document_contents),
                "created_at": "2025-09-17"
            }
            info_path = os.path.join(self.data_dir, "processed_files.json")
            with open(info_path, 'w', encoding='utf-8') as f:
                json.dump(files_info, f, indent=2)
            
            # Create RAG system with custom config for data directory
            config_path = "config.json"
            
            # Load original config
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # Update paths to use data directory
            config["index"]["save_path"] = os.path.join(self.data_dir, "faiss.index")
            config["index"]["metadata_path"] = os.path.join(self.data_dir, "metadata.pkl")
            
            # Save temporary config
            temp_config_path = "temp_config.json"
            with open(temp_config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            
            # Create RAG system and add documents (this will save to our data directory)
            temp_rag = RAGSystem(config_path=temp_config_path)
            
            # Add document contents for embedding (strings only)
            temp_rag.add_documents(document_contents, save=True)
            
            # Manually update the metadata to include file information
            temp_rag.metadata = document_metadata  # Store full metadata including filenames
            temp_rag._save_index()  # Save again with updated metadata
            
            # Clean up temporary config
            os.remove(temp_config_path)
            
            self.ui.print(f"[bold green]✅ Successfully created FAISS index from {len(document_contents)} files![/bold green]")
            self.ui.print(f"[dim]Processed files: {', '.join(processed_files)}[/dim]")
            
        except Exception as e:
            self.ui.print(f"[bold red]❌ Failed to create initial FAISS files: {e}[/bold red]")
            raise
    
    def _finalize_session(self, query_count: int):
        """Finalize the current session and save summary."""
        if self.rag and self.rag.get_session_manager():
            try:
                summary_file = self.rag.end_session(query_count)
                if summary_file:
                    session_manager = self.rag.get_session_manager()
                    if session_manager:
                        session_dir = session_manager.get_current_session_dir()
                        if session_dir:
                            self.ui.print(f"[green]📁 Session saved to: {session_dir}[/green]")
                            self.ui.print(f"[dim]Processed {query_count} queries in this session.[/dim]")
            except Exception as e:
                logger.warning(f"Failed to finalize session: {e}")