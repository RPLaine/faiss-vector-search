"""
UI Components module for the FAISS-External LLM RAG system.

This module contains all Rich-based console interface components:
- UIManager: Main class for coordinating UI elements
- Helper functions for tables, panels, and display formatting
- Progress tracking and user interaction components
"""

import numpy as np
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn
from rich.markdown import Markdown
from rich.text import Text
from rich.tree import Tree
from rich.prompt import Prompt, Confirm
from rich import box


class UIManager:
    """Manages all UI elements and user interactions for the RAG query system."""
    
    def __init__(self):
        """Initialize the UI manager with a Rich console."""
        self.console = Console()
    
    def display_welcome_header(self):
        """Display the main welcome header for the application."""
        self.console.print(Panel.fit(
            "[bold blue]🚀 RAG Query System[/bold blue]\n"
            "[dim]Production-ready RAG queries with FAISS vector search and external LLM[/dim]\n\n"
            "[green]Ready to query your knowledge base![/green]",
            border_style="blue",
            title="[bold cyan]RAG Query Tool[/bold cyan]"
        ))
    
    def display_completion_summary(self):
        """Display the completion summary and next steps."""
        completion_panel = Panel(
            "[bold green]✅ RAG Query Session Completed![/bold green]\n\n"
            "[yellow]Usage Tips:[/yellow]\n"
            "• Restart with: python main.py\n"
            "• Use different data: python main.py --data-dir /path/to/data\n"
            "• Add more documents to expand your knowledge base\n"
            "• Experiment with different query templates\n"
            "• Check your session folder for saved prompts and results\n\n"
            "[dim]Thank you for using the RAG Query System![/dim]",
            border_style="green",
            title="[bold green]Session Complete[/bold green]"
        )
        self.console.print(completion_panel)
    
    def display_context_mode_selection(self):
        """Display context mode selection and return user choice."""
        self.console.print()
        mode_panel = Panel.fit(
            "[bold cyan]🔧 Context Mode Selection[/bold cyan]\n\n"
            "[yellow]Choose how the system should respond to your queries:[/yellow]\n\n"
            "[green]1. FAISS Enhanced[/green] - Use document context from knowledge base\n"
            "[blue]2. Direct LLM[/blue] - Pure LLM responses without context\n\n"
            "[dim]You can compare different response styles this way.[/dim]",
            border_style="cyan",
            title="[bold cyan]Response Mode[/bold cyan]"
        )
        self.console.print(mode_panel)
        
        while True:
            choice = Prompt.ask(
                "[cyan]Select context mode[/cyan]",
                choices=["1", "2"],
                default="1"
            )
            
            if choice == "1":
                self.console.print("[green]✅ FAISS Enhanced mode selected[/green]")
                return True
            elif choice == "2":
                self.console.print("[blue]✅ Direct LLM mode selected[/blue]")
                return False

    def display_system_status(self, rag_stats, data_dir):
        """Display current system status and loaded data information."""
        # Display system status
        status_table = self.create_info_table(
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
            f"all-MiniLM-L6-v2 ({rag_stats.get('embedding_dimension', 'N/A')}D)"
        )
        status_table.add_row(
            "🔍 Vector Index", 
            "✅ Loaded", 
            f"{rag_stats.get('index_type', 'FAISS')} from {data_dir}/"
        )
        status_table.add_row(
            "🌐 External LLM", 
            "🔗 Connected", 
            f"{rag_stats.get('external_llm_model', 'N/A')} via API"
        )
        status_table.add_row(
            "📊 Documents", 
            "✅ Ready", 
            f"{rag_stats['total_documents']} documents available for queries"
        )
        
        self.console.print(status_table)
        self.console.print()

    def display_available_templates(self):
        """Display available query templates."""
        templates_table = self.create_info_table(
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
        
        import os
        for template, description in templates:
            template_path = f"prompts/{template}.txt"
            if os.path.exists(template_path):
                templates_table.add_row(template, description)
        
        self.console.print(templates_table)
        self.console.print()

    def display_query_header(self, query_number, query, template, use_context):
        """Display query processing header."""
        query_panel = Panel.fit(
            f"[bold white]Query #{query_number}:[/bold white] [cyan]{query}[/cyan]\n"
            f"[dim]Template: {template} | Context: {'FAISS Enhanced' if use_context else 'Direct LLM'}[/dim]",
            border_style="cyan",
            title=f"[bold cyan]Processing Query[/bold cyan]",
            title_align="left"
        )
        self.console.print(query_panel)

    def display_detailed_query_results(self, query, template, result):
        """Display comprehensive query results with config parameters."""
        # Display results summary with config parameters
        results_table = Table(
            title="📊 Query Results & Configuration",
            box=box.SIMPLE_HEAD,
            show_header=True,
            header_style="bold blue"
        )
        results_table.add_column("Metric", style="cyan", width=25)
        results_table.add_column("Value", style="green")
        
        # Query Results
        results_table.add_row("[bold]RESULTS[/bold]", "")
        results_table.add_row("Documents Found", str(result.get('num_docs_found', 0)))
        results_table.add_row("Template Used", template)
        results_table.add_row("Response Length", f"{len(result.get('response', ''))} characters")
        
        # Add processing time if available
        if 'processing_time' in result:
            processing_time = result['processing_time']
            results_table.add_row("Processing Time", f"{processing_time:.2f} seconds")
        
        # Config Parameters (if available in result)
        if 'config_params' in result:
            cfg = result['config_params']
            results_table.add_row("", "")
            results_table.add_row("[bold]CONFIGURATION[/bold]", "")
            results_table.add_row("1. LLM Model", cfg.get('llm_model', 'N/A'))
            results_table.add_row("2. Max Tokens", str(cfg.get('max_tokens', 'N/A')))
            results_table.add_row("3. Temperature", str(cfg.get('temperature', 'N/A')))
            results_table.add_row("4. Embedding Model", cfg.get('embedding_model', 'N/A'))
            results_table.add_row("5. Dimensions", str(cfg.get('dimension', 'N/A')))
            results_table.add_row("6. Retrieval Top K", str(cfg.get('top_k', 'N/A')))
            results_table.add_row("7. Similarity Threshold", str(cfg.get('similarity_threshold', 'N/A')))
            results_table.add_row("8. Max Context Length", str(cfg.get('max_context_length', 'N/A')))
            results_table.add_row("9. Index Type", cfg.get('index_type', 'N/A'))
        
        self.console.print(results_table)
        
        # Display LLM response
        if result.get('response'):
            response_panel = Panel(
                result['response'],
                title="[bold green]🤖 Response[/bold green]",
                border_style="green",
                padding=(1, 2)
            )
            self.console.print(response_panel)
        
        return result.get('context_docs', [])

    def display_source_documents(self, context_docs):
        """Display source documents used in the query."""
        self.console.print("[bold yellow]📚 Source Documents:[/bold yellow]")
        for i, doc in enumerate(context_docs, 1):
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
            self.console.print(doc_panel)

    def display_ready_for_queries(self, use_context):
        """Display ready for queries panel."""
        self.console.print(Panel.fit(
            "[bold blue]🚀 RAG Query Interface[/bold blue]\n"
            f"[yellow]Context Mode: {'FAISS Enhanced' if use_context else 'Direct LLM'}[/yellow]\n"
            "[dim]Enter queries to search your knowledge base. Type 'quit' or 'exit' to stop.[/dim]\n"
            "[dim]Press Ctrl+C at any time to interrupt.[/dim]",
            border_style="blue",
            title="[bold cyan]Ready for Queries[/bold cyan]"
        ))

    def display_ready_for_queries_flexible(self):
        """Display ready for queries panel without pre-selecting context mode."""
        panel_content = """[bold green]✅ System Ready for Queries[/bold green]

[cyan]📋 Query Options:[/cyan]
• [bold]FAISS Enhanced[/bold]: Uses document context for informed responses
• [bold]Direct LLM[/bold]: Direct AI responses without document context

[yellow]💡 You can choose the mode for each individual query[/yellow]

[dim]Commands: 'quit', 'exit', or 'q' to exit | Press Ctrl+C to interrupt[/dim]"""
        
        self.console.print(Panel(
            panel_content,
            title="[bold green]🚀 Query System[/bold green]",
            border_style="green",
            padding=(1, 2)
        ))

    def display_initialization_panel(self, data_dir):
        """Display RAG system initialization panel."""
        self.console.print(Panel.fit(
            f"[bold cyan]🔧 Initializing RAG Query System[/bold cyan]\n"
            f"[dim]Loading from '{data_dir}' directory...[/dim]",
            border_style="cyan"
        ))

    def display_index_creation_panel(self):
        """Display FAISS index creation panel."""
        self.console.print(Panel.fit(
            "[bold yellow]🔄 Creating fresh FAISS index from files directory...[/bold yellow]\n"
            "[dim]Loading documents from 'files' directory and building new index...[/dim]",
            border_style="yellow",
            title="[bold yellow]Index Creation[/bold yellow]"
        ))

    def display_knowledge_base_ready(self, data_dir):
        """Display knowledge base ready panel."""
        self.console.print(Panel.fit(
            f"[bold green]📁 Knowledge Base Ready[/bold green]\n"
            f"[dim]Using FAISS index and metadata from '{data_dir}' directory[/dim]",
            border_style="green"
        ))

    def get_context_mode_choice(self):
        """Get context mode choice for each individual query."""
        self.console.print("\n[bold cyan]📋 Select query mode for this question:[/bold cyan]")
        
        choice = Prompt.ask(
            "[cyan]Choose mode: [1] FAISS Enhanced (with document context) | [2] Direct LLM (no context)[/cyan]",
            choices=["1", "2"],
            default="1"
        )
        
        if choice == "2":
            self.console.print("[yellow]🤖 Using Direct LLM mode (no document context)[/yellow]")
            return False
        else:
            self.console.print("[green]📚 Using FAISS Enhanced mode (with document context)[/green]")
            return True

    def get_template_choice(self):
        """Get template choice from user."""
        return Prompt.ask(
            "[cyan]📝 Select template[/cyan]",
            default="basic_rag"
        )
    
    def create_info_table(self, title, box_style=box.ROUNDED, title_style="bold green", header_style="bold cyan"):
        """Create a standardized info table with common styling."""
        return Table(
            title=title,
            box=box_style,
            title_style=title_style,
            show_header=True,
            header_style=header_style
        )
    
    def create_status_panel(self, message, style="green", border_style=None):
        """Create a standardized status panel."""
        return Panel.fit(
            message,
            border_style=border_style or style
        )
    
    def display_system_info(self, rag_system):
        """Display system initialization information."""
        info_table = self.create_info_table(
            title="📋 RAG System Information",
            box_style=box.ROUNDED,
            header_style="bold cyan"
        )
        info_table.add_column("Component", style="cyan")
        info_table.add_column("Status", style="green")
        info_table.add_column("Details", style="white")
        
        info_table.add_row("Vector Store", "✅ Initialized", "FAISS index ready")
        info_table.add_row("Embedding Model", "✅ Loaded", "Sentence transformer model")
        info_table.add_row("Document Store", "✅ Ready", "Metadata persistence enabled")
        info_table.add_row("Templates", "✅ Available", "4 query templates loaded")
        
        self.console.print(info_table)
    
    def display_document_loading_status(self, document_count):
        """Display document loading status."""
        status_panel = self.create_status_panel(
            f"[bold green]✅ Documents Loaded Successfully[/bold green]\n"
            f"[white]Total documents: {document_count}[/white]",
            style="green"
        )
        self.console.print(status_panel)
    
    def display_query_results(self, query, template, results, llm_response):
        """Display query results in a formatted table."""
        # Display query information
        query_panel = Panel(
            f"[bold cyan]Query:[/bold cyan] {query}\n"
            f"[bold yellow]Template:[/bold yellow] {template}",
            border_style="cyan",
            title="[bold white]Query Details[/bold white]"
        )
        self.console.print(query_panel)
        
        # Display search results
        if results:
            results_table = self.create_info_table(
                title=f"🔍 Retrieved Documents (Top {len(results)})",
                box_style=box.ROUNDED,
                header_style="bold green"
            )
            results_table.add_column("Rank", style="dim", width=4)
            results_table.add_column("Similarity", style="green", justify="right")
            results_table.add_column("Document Preview", style="white")
            
            for i, (doc, score) in enumerate(results, 1):
                preview = doc[:100] + "..." if len(doc) > 100 else doc
                results_table.add_row(str(i), f"{score:.4f}", preview)
            
            self.console.print(results_table)
        
        # Display LLM response
        if llm_response:
            response_panel = Panel(
                llm_response,
                border_style="green",
                title="[bold green]🤖 LLM Response[/bold green]"
            )
            self.console.print(response_panel)
    
    def interactive_search_demo(self, rag_system):
        """Interactive search demonstration with detailed FAISS analysis."""
        while True:
            self.console.print()
            
            # Get search query from user
            default_query = "renewable energy sources"
            search_query = Prompt.ask(
                "[cyan]🔍 Enter search query[/cyan]", 
                default=default_query
            )
            
            # Get k value from user with validation
            while True:
                try:
                    k_input = Prompt.ask(
                        "[cyan]📊 Number of results to retrieve (k)[/cyan]", 
                        default="3"
                    )
                    k_value = int(k_input)
                    if k_value > 0:
                        break
                    else:
                        self.console.print("[red]❌ Please enter a positive number[/red]")
                except ValueError:
                    self.console.print("[red]❌ Please enter a valid number[/red]")
            
            # Perform detailed search
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=self.console,
                transient=True
            ) as progress:
                search_task = progress.add_task(f"[orange]Analyzing: '{search_query}'...", total=None)
                search_results = rag_system.search_detailed(search_query, k=k_value)
                progress.update(search_task, description="[green]✅ Search analysis completed")
            
            # Display search metadata
            self._display_search_analysis(search_query, search_results)
            
            # Display detailed results
            if search_results["documents"]:
                self._display_search_results(search_results)
                
                # Option to view full documents
                if Confirm.ask("[yellow]📖 View full document content?[/yellow]", default=False):
                    self._display_full_documents(search_results)
                
                # Option to view embedding vector information
                if Confirm.ask("[yellow]🧮 View embedding vector details?[/yellow]", default=False):
                    self._display_vector_analysis(search_results)
            else:
                self.console.print("[red]❌ No documents found matching the search criteria.[/red]")
            
            self.console.print()
            
            # Ask if user wants to try another search
            if not Confirm.ask("[yellow]🔄 Try another search?[/yellow]", default=True):
                break
    
    def _display_search_analysis(self, search_query, search_results):
        """Display search metadata and analysis."""
        info_table = self.create_info_table(
            title="🔬 FAISS Search Analysis",
            box_style=box.ROUNDED,
            header_style="bold orange"
        )
        info_table.add_column("Parameter", style="cyan")
        info_table.add_column("Value", style="green", justify="right")
        info_table.add_column("Details", style="white")
        
        search_info = search_results["search_info"]
        info_table.add_row(
            "Query", 
            f"'{search_query}'", 
            f"Embedded to {search_info.get('query_embedding_dimension', 'N/A')}D vector"
        )
        info_table.add_row(
            "Index Type", 
            search_info.get('index_type', 'Unknown'), 
            "FAISS index implementation"
        )
        info_table.add_row(
            "Total Documents", 
            str(search_info.get('total_documents_in_index', 0)), 
            "Documents available for search"
        )
        info_table.add_row(
            "Requested K", 
            str(search_info.get('requested_k', 0)), 
            "Number of results requested"
        )
        info_table.add_row(
            "Results Found", 
            str(search_info.get('filtered_results', 0)), 
            "Documents passing similarity threshold"
        )
        
        self.console.print(info_table)
    
    def _display_search_results(self, search_results):
        """Display detailed search results in a table."""
        results_table = self.create_info_table(
            title=f"📋 Search Results (Top {len(search_results['documents'])})",
            box_style=box.ROUNDED,
            header_style="bold green"
        )
        results_table.add_column("Rank", style="dim", width=4)
        results_table.add_column("Similarity", style="green", justify="right")
        results_table.add_column("Distance", style="yellow", justify="right")
        results_table.add_column("Index", style="cyan", justify="right")
        results_table.add_column("Document Preview", style="white")
        
        for i, (doc, score, idx, distance) in enumerate(zip(
            search_results["documents"], 
            search_results["scores"], 
            search_results["indices"],
            search_results["distances"]
        ), 1):
            preview = doc[:80] + "..." if len(doc) > 80 else doc
            results_table.add_row(
                str(i),
                f"{score:.4f}",
                f"{distance:.4f}",
                str(idx),
                preview
            )
        
        self.console.print(results_table)
    
    def _display_full_documents(self, search_results):
        """Display full document content."""
        for i, doc in enumerate(search_results["documents"], 1):
            doc_panel = Panel(
                doc,
                title=f"[bold cyan]Document {i} (Index: {search_results['indices'][i-1]})[/bold cyan]",
                border_style="cyan",
                padding=(1, 2)
            )
            self.console.print(doc_panel)
    
    def _display_vector_analysis(self, search_results):
        """Display embedding vector analysis."""
        query_vector = search_results["query_vector"]
        if query_vector is not None:
            vector_info = self.create_info_table(
                title="🧮 Query Embedding Vector Analysis",
                box_style=box.SIMPLE,
                header_style="bold magenta"
            )
            vector_info.add_column("Property", style="cyan")
            vector_info.add_column("Value", style="green")
            
            vector_info.add_row("Dimension", str(len(query_vector)))
            vector_info.add_row("Min Value", f"{query_vector.min():.6f}")
            vector_info.add_row("Max Value", f"{query_vector.max():.6f}")
            vector_info.add_row("Mean", f"{query_vector.mean():.6f}")
            vector_info.add_row("Std Dev", f"{query_vector.std():.6f}")
            vector_info.add_row("L2 Norm", f"{np.linalg.norm(query_vector):.6f}")
            
            self.console.print(vector_info)
            
            # Show first few vector components
            self.console.print(f"\n[dim]First 10 vector components: {query_vector[:10].tolist()}[/dim]")
    
    def show_progress(self, description, total=None):
        """Create and return a progress context manager."""
        return Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn() if total else "",
            TimeElapsedColumn(),
            console=self.console,
            transient=True
        )
    
    def print(self, *args, **kwargs):
        """Proxy method to console.print for convenience."""
        return self.console.print(*args, **kwargs)
    
    def display_info(self, message, style="blue"):
        """Display an informational message."""
        self.console.print(f"[{style}]ℹ {message}[/{style}]")
    
    def input(self, prompt, **kwargs):
        """Proxy method for user input with Rich styling."""
        return Prompt.ask(prompt, **kwargs)
    
    def confirm(self, prompt, **kwargs):
        """Proxy method for confirmation prompts."""
        return Confirm.ask(prompt, **kwargs)