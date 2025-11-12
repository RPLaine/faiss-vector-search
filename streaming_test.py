import aiohttp
from aiohttp import ClientTimeout
import asyncio
import json
import time
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree
from rich import box

# Initialize Rich console
console = Console()

async def test_streaming():
    url = "https://www.northbeach.fi/dolphin/stream"
    
    payload = {
        "messages": [
            {"role": "system", "content": "Olet avulias avustaja."},
            {"role": "user", "content": "Kuka on Sauli Niinistö?"}
        ],
        "model": "gemma",
        "enable_thinking": False,
        "temperature": 0.1,
        "top_p": 0.5,
        "top_k": 10,
        "max_tokens": 200
    }
    
    # Display request payload
    request_tree = Tree("📤 [bold cyan]Streaming Request[/bold cyan]")
    request_tree.add(f"[dim]URL:[/dim] [green]{url}[/green]")
    request_tree.add(f"[dim]Model:[/dim] [yellow]{payload['model']}[/yellow]")
    request_tree.add(f"[dim]Temperature:[/dim] [magenta]{payload['temperature']}[/magenta]")
    request_tree.add(f"[dim]Max tokens:[/dim] [cyan]{payload['max_tokens']}[/cyan]")
    
    console.print(Panel(request_tree, title="🚀 Request Details", border_style="cyan", box=box.ROUNDED))
    
    # Create a timeout (10 minutes)
    timeout = ClientTimeout(total=600)
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(url, json=payload) as response:
            # Status display
            status_style = "green" if 200 <= response.status < 300 else "red"
            console.print(f"[{status_style}]📡 Status: {response.status}[/{status_style}]")
            
            if response.status != 200:
                error = await response.text()
                console.print(Panel(
                    f"[bold red]❌ {error}[/bold red]",
                    title="⚠️  Error",
                    border_style="red",
                    box=box.HEAVY
                ))
                return
            
            console.print("\n[bold green]📝 Streaming Response:[/bold green]")
            console.print("[white]", end="")
            
            full_content = ""
            token_count = 0
            start_time = time.time()
            
            # Read the streaming response as plain text
            async for chunk in response.content.iter_any():
                if chunk:
                    text = chunk.decode('utf-8')
                    # Print the text immediately as it arrives
                    console.print(text, end="")
                    full_content += text
                    # Approximate token count (rough estimate)
                    token_count = len(full_content.split())
            
            # Calculate metrics
            generation_time = time.time() - start_time
            tokens_per_second = token_count / generation_time if generation_time > 0 else 0
            
            console.print("\n")
            
            # Beautiful completion summary
            stats_table = Table(box=box.SIMPLE)
            stats_table.add_column("Metric", style="cyan")
            stats_table.add_column("Value", style="green")
            
            stats_table.add_row("Approximate Tokens", str(token_count))
            stats_table.add_row("Generation Time", f"{generation_time:.2f}s")
            stats_table.add_row("Estimated Speed", f"{tokens_per_second:.2f} tokens/s")
            
            console.print(Panel(stats_table, title="✨ Stream Complete", border_style="green", box=box.ROUNDED))

async def test_health():
    url = "https://www.northbeach.fi/dolphin/"
    timeout = ClientTimeout(total=10)
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as response:
            status_style = "green" if 200 <= response.status < 300 else "red"
            console.print(f"[{status_style}]📡 Status: {response.status}[/{status_style}]")
            
            response_data = await response.json()
            
            # Display server info in a beautiful table
            info_table = Table(title="🔍 Server Information", box=box.ROUNDED)
            info_table.add_column("Property", style="cyan", no_wrap=True)
            info_table.add_column("Value", style="magenta")
            
            for key, value in response_data.items():
                if isinstance(value, list):
                    value_str = ", ".join(str(v) for v in value)
                else:
                    value_str = str(value)
                info_table.add_row(key, value_str)
            
            console.print(info_table)

async def test_comparison():
    """Test both streaming and non-streaming to compare experience"""
    console.print(Panel(
        "[bold cyan]Comparison Test: Streaming Experience[/bold cyan]",
        title="🔬 Performance Analysis",
        border_style="cyan",
        box=box.DOUBLE
    ))
    
    # Same prompt for both
    payload = {
        "messages": [
            {"role": "user", "content": "Explain what a neural network is in one paragraph."}
        ],
        "model": "gemma",
        "enable_thinking": False,
        "temperature": 0.7,
        "top_p": 0.95,
        "top_k": 50,
        "max_tokens": 150
    }
    
    timeout = ClientTimeout(total=600)
    
    # Test: Streaming
    console.print("\n[bold cyan]📡 TEST: STREAMING[/bold cyan]")
    console.print("[yellow]⏱️  Starting stream...[/yellow]")
    
    stream_url = "https://www.northbeach.fi/dolphin/stream"
    stream_start = time.time()
    first_chunk_time = None
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(stream_url, json=payload) as response:
            if response.status == 200:
                console.print("[white]", end="")
                async for chunk in response.content.iter_any():
                    if chunk:
                        if first_chunk_time is None:
                            first_chunk_time = time.time() - stream_start
                            console.print(f"\n[green]⚡ First chunk: {first_chunk_time:.2f}s[/green]")
                            console.print("[white]", end="")
                        
                        text = chunk.decode('utf-8')
                        console.print(text, end="")
                
                total_time = time.time() - stream_start
                console.print("\n")
                
                # Results panel
                results_tree = Tree("✅ [bold green]Streaming Results[/bold green]")
                results_tree.add(f"[dim]First chunk:[/dim] [yellow]{first_chunk_time:.2f}s[/yellow]")
                results_tree.add(f"[dim]Total time:[/dim] [cyan]{total_time:.2f}s[/cyan]")
                
                console.print(Panel(results_tree, title="📊 Performance", border_style="green", box=box.ROUNDED))

async def main():
    console.print(Panel(
        "[bold bright_cyan]Streaming API Test Suite[/bold bright_cyan]",
        title="🧪 Test Runner",
        border_style="bright_cyan",
        box=box.DOUBLE,
        padding=(1, 2)
    ))
    
    # Test health endpoint
    console.print("\n[bold yellow]═══ HEALTH CHECK ═══[/bold yellow]\n")
    await test_health()
    
    # Test streaming
    console.print("\n[bold yellow]═══ STREAMING GENERATION ═══[/bold yellow]\n")
    await test_streaming()
    
    # Uncomment to run comparison test
    # console.print("\n[bold yellow]═══ COMPARISON TEST ═══[/bold yellow]\n")
    # await test_comparison()

if __name__ == "__main__":
    asyncio.run(main())
