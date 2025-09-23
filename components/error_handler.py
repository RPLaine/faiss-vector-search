"""
Error Handler module for the FAISS-External LLM RAG system.

This module provides centralized error handling and troubleshooting information
for the RAG query system and demo functionality.
"""

import traceback
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich import box


def handle_demo_errors(error):
    """
    Handle errors that occur during demo execution with helpful troubleshooting.
    
    Args:
        error: The exception that was raised
    """
    console = Console()
    
    # Determine error type and provide specific guidance
    error_type = type(error).__name__
    error_message = str(error)
    
    # Create main error panel
    error_panel = Panel(
        f"[bold red]❌ {error_type}[/bold red]\n"
        f"[white]{error_message}[/white]",
        border_style="red",
        title="[bold red]Demo Error[/bold red]",
        padding=(1, 2)
    )
    console.print(error_panel)
    
    # Provide troubleshooting table
    troubleshooting_table = Table(
        title="🔧 Troubleshooting Guide",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold yellow"
    )
    troubleshooting_table.add_column("Issue", style="cyan")
    troubleshooting_table.add_column("Solution", style="green")
    
    # Common error patterns and solutions
    if "import" in error_message.lower() or "modulenotfounderror" in error_type.lower():
        troubleshooting_table.add_row(
            "Missing Dependencies",
            "Run: pip install -r requirements.txt"
        )
        troubleshooting_table.add_row(
            "Python Path Issues",
            "Ensure you're running from the project root directory"
        )
        troubleshooting_table.add_row(
            "Virtual Environment",
            "Activate your virtual environment if using one"
        )
    
    elif "faiss" in error_message.lower():
        troubleshooting_table.add_row(
            "FAISS Installation",
            "Install FAISS: pip install faiss-cpu"
        )
        troubleshooting_table.add_row(
            "FAISS GPU Issues",
            "Try CPU version: pip uninstall faiss-gpu && pip install faiss-cpu"
        )
    
    elif "sentence" in error_message.lower() or "transformers" in error_message.lower():
        troubleshooting_table.add_row(
            "Sentence Transformers",
            "Install: pip install sentence-transformers"
        )
        troubleshooting_table.add_row(
            "Model Download",
            "First run may take time to download models"
        )
    
    elif "rich" in error_message.lower():
        troubleshooting_table.add_row(
            "Rich Library",
            "Install: pip install rich"
        )
    
    elif "template" in error_message.lower() or "prompts" in error_message.lower():
        troubleshooting_table.add_row(
            "Missing Templates",
            "Check prompts/ directory exists with required .txt files"
        )
        troubleshooting_table.add_row(
            "Template Files",
            "Ensure basic_rag.txt, detailed_rag.txt, technical_rag.txt, concise_rag.txt exist"
        )
    
    elif "data directory" in error_message.lower() or "faiss.index" in error_message.lower():
        troubleshooting_table.add_row(
            "Missing FAISS Data",
            "Ensure faiss.index and metadata.pkl exist in data directory"
        )
        troubleshooting_table.add_row(
            "Data Directory",
            "Run demo mode first to create sample data, or provide existing FAISS files"
        )
        troubleshooting_table.add_row(
            "File Paths",
            "Check --data-dir argument points to correct directory"
        )
    
    elif "connection" in error_message.lower() or "network" in error_message.lower():
        troubleshooting_table.add_row(
            "Network Issues",
            "Check internet connection for model downloads"
        )
        troubleshooting_table.add_row(
            "Proxy Settings",
            "Configure proxy if behind corporate firewall"
        )
    
    elif "memory" in error_message.lower() or "out of memory" in error_message.lower():
        troubleshooting_table.add_row(
            "Memory Issues",
            "Try smaller batch sizes or restart Python"
        )
        troubleshooting_table.add_row(
            "GPU Memory",
            "Use CPU version if GPU memory insufficient"
        )
    
    else:
        # Generic troubleshooting for unknown errors
        troubleshooting_table.add_row(
            "General Issues",
            "Check all dependencies are installed"
        )
        troubleshooting_table.add_row(
            "Environment",
            "Ensure Python 3.8+ is being used"
        )
        troubleshooting_table.add_row(
            "File Permissions",
            "Check read/write permissions for data files"
        )
    
    # Always add these general tips
    troubleshooting_table.add_row(
        "Clean Installation",
        "Try: pip uninstall <package> && pip install <package>"
    )
    troubleshooting_table.add_row(
        "Update Dependencies",
        "Run: pip install --upgrade -r requirements.txt"
    )
    
    console.print(troubleshooting_table)
    
    # Show detailed traceback for developers
    console.print("\n[bold yellow]📋 Detailed Error Information:[/bold yellow]")
    traceback_text = Text(traceback.format_exc())
    traceback_panel = Panel(
        traceback_text,
        border_style="dim",
        title="[dim]Full Traceback[/dim]",
        padding=(1, 2)
    )
    console.print(traceback_panel)
    
    # Provide contact information
    help_panel = Panel(
        "[bold cyan]🆘 Need More Help?[/bold cyan]\n\n"
        "• Check the README.md file for setup instructions\n"
        "• Review the requirements.txt for dependencies\n"
        "• Ensure you're running from the correct directory\n"
        "• Try running the original example.py to isolate issues\n\n"
        "[dim]This modular architecture is designed to make debugging easier![/dim]",
        border_style="cyan",
        title="[bold cyan]Additional Support[/bold cyan]"
    )
    console.print(help_panel)


def handle_import_errors():
    """
    Handle import errors specifically during module loading.
    This is called when critical imports fail.
    """
    console = Console()
    
    error_panel = Panel(
        "[bold red]❌ Critical Import Error[/bold red]\n"
        "[white]Failed to import required modules for the RAG system.[/white]",
        border_style="red",
        title="[bold red]Startup Error[/bold red]"
    )
    console.print(error_panel)
    
    # Import troubleshooting
    import_table = Table(
        title="📦 Required Dependencies",
        box=box.SIMPLE,
        show_header=True,
        header_style="bold green"
    )
    import_table.add_column("Package", style="cyan")
    import_table.add_column("Install Command", style="green")
    import_table.add_column("Purpose", style="white")
    
    dependencies = [
        ("faiss-cpu", "pip install faiss-cpu", "Vector similarity search"),
        ("sentence-transformers", "pip install sentence-transformers", "Text embeddings"),
        ("rich", "pip install rich", "Console UI"),
        ("numpy", "pip install numpy", "Numerical operations"),
        ("requests", "pip install requests", "HTTP requests for LLM API")
    ]
    
    for package, command, purpose in dependencies:
        import_table.add_row(package, command, purpose)
    
    console.print(import_table)
    
    console.print("\n[bold yellow]💡 Quick Fix:[/bold yellow]")
    console.print("[green]pip install -r requirements.txt[/green]")


def handle_rag_system_errors(error):
    """
    Handle errors specific to RAG system operation.
    
    Args:
        error: The RAG system error
    """
    console = Console()
    
    error_panel = Panel(
        f"[bold red]❌ RAG System Error[/bold red]\n"
        f"[white]{str(error)}[/white]",
        border_style="red",
        title="[bold red]System Error[/bold red]"
    )
    console.print(error_panel)
    
    # RAG-specific troubleshooting
    rag_table = Table(
        title="🔧 RAG System Troubleshooting",
        box=box.ROUNDED,
        show_header=True,
        header_style="bold orange"
    )
    rag_table.add_column("Component", style="cyan")
    rag_table.add_column("Common Issues", style="yellow")
    rag_table.add_column("Solutions", style="green")
    
    rag_table.add_row(
        "Vector Index",
        "FAISS index corruption",
        "Delete files/ directory and restart"
    )
    rag_table.add_row(
        "Embeddings",
        "Model download failure",
        "Check internet connection, retry"
    )
    rag_table.add_row(
        "External LLM",
        "API configuration issues",
        "Check config.json settings"
    )
    rag_table.add_row(
        "Documents",
        "Loading/processing errors",
        "Check data/sample_documents.json format"
    )
    
    console.print(rag_table)