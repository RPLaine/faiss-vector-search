"""
Build initial FAISS index for AI Journalist system using knowledge base documents.

This script reads text files from data2/ directory and builds a FAISS index
by calling the server's API endpoint.
"""

import requests
import json
from pathlib import Path

# API configuration
API_URL = "http://localhost:8001/api/retrieval/index/build"

# Data directory
DATA_DIR = Path("data2")

def build_index():
    """Build FAISS index from text files in data2/ directory"""
    
    # Check if data2 directory exists
    if not DATA_DIR.exists():
        print(f"Error: {DATA_DIR} directory not found")
        return
    
    # Get all .txt files
    txt_files = list(DATA_DIR.glob("*.txt"))
    
    if not txt_files:
        print(f"No .txt files found in {DATA_DIR}")
        return
    
    print(f"Found {len(txt_files)} text files:")
    for file in txt_files:
        print(f"  - {file.name}")
    
    # Convert paths to strings (relative to project root)
    file_paths = [str(file) for file in txt_files]
    
    # Prepare payload
    payload = {
        "file_paths": file_paths
    }
    
    print(f"\nSending request to {API_URL}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        # Send POST request
        response = requests.post(
            API_URL,
            json=payload,
            timeout=30
        )
        
        # Check response
        if response.status_code == 200:
            result = response.json()
            print("\n✓ Index built successfully!")
            print(f"Response: {json.dumps(result, indent=2)}")
        else:
            print(f"\n✗ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("\n✗ Error: Could not connect to server")
        print("Make sure server2.py is running on port 8001")
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")

if __name__ == "__main__":
    print("=" * 60)
    print("FAISS Index Builder for AI Journalist System")
    print("=" * 60)
    build_index()
