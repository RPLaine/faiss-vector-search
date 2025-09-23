# FAISS Document Search System

RAG system with FAISS vector search and external LLM integration for document querying.

## Features

- FAISS vector search for semantic document retrieval
- DOCX to text conversion with chunking
- External LLM integration
- Session management with automatic saving
- Interactive CLI interface

## Project Structure

```
faiss-system/
├── main.py                     # Main entry point
├── process_docx_files.py       # DOCX conversion
├── chunk_text_files.py         # Text chunking and indexing
├── requirements.txt
├── components/                 # Core components
├── config_example.json          # Configuration template
├── data/                      # FAISS index files
├── docx-files/               # Source documents
├── txt-files/                # Converted text
├── files/                    # Chunked text
└── sessions/                 # Query history
```

## Installation

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Create configuration file**:
   ```bash
   cp config_example.json config.json
   ```

3. **Configure LLM** (edit `config.json`):
   - Update `url` with your LLM API endpoint
   - Update `model` with your model name
   - Add `api_key` if required by your LLM service
   ```json
   {
       "external_llm": {
           "url": "http://your-llm-server:11434/api/generate",
           "model": "llama3:8b-instruct-q4_K_M",
           "api_key": "your-api-key-if-needed"
       }
   }
   ```

## Usage

### Process Documents
```bash
python process_docx_files.py  # Convert DOCX to text
python chunk_text_files.py    # Create FAISS index
```

### Query System
```bash
python main.py                        # Default data directory
python main.py --data-dir files       # Use files directory
```

Type your questions in the interactive prompt. Use `exit` or `Ctrl+C` to quit.

## Configuration

Edit `config.json`:
```json
{
    "external_llm": {
        "url": "http://your-llm-server:port/api/generate",
        "model": "your-model-name",
        "timeout": 3600,
        "max_tokens": 20000,
        "temperature": 0.7
    }
}
```

## Troubleshooting

- **Index not found**: Run `chunk_text_files.py` to create FAISS index
- **LLM connection failed**: Check `config.json` configuration
- **Memory issues**: Reduce chunk size for large datasets