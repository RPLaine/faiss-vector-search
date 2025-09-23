"""
Text File Chunking Script with Conversational Structure Support

This script processes all text files in the 'txt-files' directory,
splits them into manageable chunks while respecting conversational structure,
and saves them as separate files in the 'files' directory.

Usage:
    python chunk_text_files.py

The script will:
1. Scan the 'txt-files' directory for all .txt files
2. Read each text file and split it into chunks
3. Detect conversational structure (K: questioner, V: answerer)
4. Save each chunk as a separate file in the 'files' directory
5. Preserve metadata about the source file and chunk number
6. Handle encoding and error cases gracefully

Chunking strategy:
- For conversational files: Split at speaker changes (K:/V: markers)
- For regular files: Split by paragraphs first (double newlines)
- If chunks are too long, split by sentences while preserving structure
- Maintain chunk size between 500-2000 characters
- Preserve context by adding overlap between chunks
"""

import os
import re
from pathlib import Path
from typing import List, Tuple
import shutil


def clear_directory(directory_path):
    """Clear all files from a directory while keeping the directory itself."""
    if directory_path.exists():
        for item in directory_path.iterdir():
            if item.is_file():
                item.unlink()  # Remove file
            elif item.is_dir():
                shutil.rmtree(item)  # Remove directory and contents
        print(f"  Cleared existing files from {directory_path}")


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using common sentence endings."""
    # Split on periods, exclamation marks, and question marks followed by whitespace
    sentences = re.split(r'[.!?]+\s+', text)
    # Clean up and filter empty sentences
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences


def detect_conversational_structure(text: str) -> bool:
    """Detect if the text contains conversational markers (K: or V:)."""
    return bool(re.search(r'(?:^|\s)[KV]:', text, re.MULTILINE))


def find_line_positions(text: str, chunk_text: str) -> Tuple[int, int]:
    """
    Find the start and end line numbers for a chunk within the original text.
    
    Args:
        text: Original full text
        chunk_text: The chunk text to find
    
    Returns:
        Tuple of (start_line, end_line) - 1-indexed
    """
    lines = text.split('\n')
    chunk_lines = chunk_text.split('\n')
    
    # Find the first line of the chunk
    start_line = 1
    for i, line in enumerate(lines):
        if chunk_lines[0].strip() in line.strip() and line.strip():
            start_line = i + 1
            break
    
    # Calculate end line
    end_line = start_line + len(chunk_lines) - 1
    
    return start_line, end_line


def create_conversational_chunks(text: str, min_chunk_size: int = 500, max_chunk_size: int = 2000, overlap_turns: int = 1) -> List[Tuple[str, int, int]]:
    """
    Split conversational text into chunks that respect K:/V: speaker structure.
    
    Args:
        text: Input conversational text
        min_chunk_size: Minimum characters per chunk
        max_chunk_size: Maximum characters per chunk
        overlap_turns: Number of previous turns to include for context
    
    Returns:
        List of tuples (chunk_text, start_line, end_line)
    """
    if not text.strip():
        return []
    
    # Split text into conversational turns based on K: or V: markers
    # Pattern matches K: or V: at the beginning of a line or after whitespace
    turns = re.split(r'(?=(?:^|\s)[KV]:)', text, flags=re.MULTILINE)
    turns = [turn.strip() for turn in turns if turn.strip()]
    
    if not turns:
        start_line, end_line = find_line_positions(text, text)
        return [(text, start_line, end_line)]  # Fallback if no turns found
    
    chunks = []
    current_chunk = ""
    current_size = 0
    
    i = 0
    while i < len(turns):
        turn = turns[i]
        turn_size = len(turn)
        
        # If adding this turn would exceed max size, finalize current chunk
        if current_size + turn_size > max_chunk_size and current_chunk:
            if current_size >= min_chunk_size:
                start_line, end_line = find_line_positions(text, current_chunk.strip())
                chunks.append((current_chunk.strip(), start_line, end_line))
                
                # Start new chunk with overlap (previous turn(s) for context)
                if overlap_turns > 0 and i > 0:
                    overlap_start = max(0, i - overlap_turns)
                    overlap_content = "\n\n".join(turns[overlap_start:i])
                    current_chunk = overlap_content + "\n\n" + turn
                    current_size = len(current_chunk)
                else:
                    current_chunk = turn
                    current_size = turn_size
            else:
                # Current chunk is too small, just add the turn
                if current_chunk:
                    current_chunk += "\n\n" + turn
                else:
                    current_chunk = turn
                current_size = len(current_chunk)
        else:
            # Add turn to current chunk
            if current_chunk:
                current_chunk += "\n\n" + turn
            else:
                current_chunk = turn
            current_size = len(current_chunk)
        
        i += 1
    
    # Add the last chunk if it exists
    if current_chunk.strip():
        # If the last chunk is too small, try to merge with previous
        if len(current_chunk) < min_chunk_size and chunks:
            # Update the last chunk to include this content
            last_chunk_text, last_start, _ = chunks[-1]
            merged_content = last_chunk_text + "\n\n" + current_chunk
            _, end_line = find_line_positions(text, merged_content)
            chunks[-1] = (merged_content, last_start, end_line)
        else:
            start_line, end_line = find_line_positions(text, current_chunk.strip())
            chunks.append((current_chunk.strip(), start_line, end_line))
    
    return chunks


def create_chunks(text: str, min_chunk_size: int = 500, max_chunk_size: int = 2000, overlap: int = 100) -> List[Tuple[str, int, int]]:
    """
    Split text into chunks with specified size constraints.
    Uses conversational chunking for dialogue content, regular chunking otherwise.
    
    Args:
        text: Input text to chunk
        min_chunk_size: Minimum characters per chunk
        max_chunk_size: Maximum characters per chunk
        overlap: Characters to overlap between chunks for context
    
    Returns:
        List of tuples (chunk_text, start_line, end_line)
    """
    if not text.strip():
        return []
    
    # Check if this is conversational content
    if detect_conversational_structure(text):
        return create_conversational_chunks(text, min_chunk_size, max_chunk_size, overlap_turns=1)
    else:
        return create_regular_chunks(text, min_chunk_size, max_chunk_size, overlap)


def create_regular_chunks(text: str, min_chunk_size: int = 500, max_chunk_size: int = 2000, overlap: int = 100) -> List[Tuple[str, int, int]]:
    """
    Split non-conversational text into chunks using paragraph and sentence boundaries.
    
    Args:
        text: Input text to chunk
        min_chunk_size: Minimum characters per chunk
        max_chunk_size: Maximum characters per chunk
        overlap: Characters to overlap between chunks for context
    
    Returns:
        List of tuples (chunk_text, start_line, end_line)
    """
    chunks = []
    
    # First, try splitting by paragraphs (double newlines)
    paragraphs = text.split('\n\n')
    
    current_chunk = ""
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
            
        # If adding this paragraph would exceed max size, finalize current chunk
        if current_chunk and len(current_chunk + "\n\n" + paragraph) > max_chunk_size:
            if len(current_chunk) >= min_chunk_size:
                start_line, end_line = find_line_positions(text, current_chunk.strip())
                chunks.append((current_chunk.strip(), start_line, end_line))
                # Start new chunk with overlap
                current_chunk = current_chunk[-overlap:] + "\n\n" + paragraph
            else:
                # Current chunk is too small, just add the paragraph
                current_chunk += "\n\n" + paragraph
        else:
            # Add paragraph to current chunk
            if current_chunk:
                current_chunk += "\n\n" + paragraph
            else:
                current_chunk = paragraph
    
    # Handle the last chunk
    if current_chunk.strip():
        # If the last chunk is too small, try to merge with previous
        if len(current_chunk) < min_chunk_size and chunks:
            last_chunk_text, last_start, _ = chunks[-1]
            merged_content = last_chunk_text + "\n\n" + current_chunk
            _, end_line = find_line_positions(text, merged_content)
            chunks[-1] = (merged_content, last_start, end_line)
        else:
            start_line, end_line = find_line_positions(text, current_chunk.strip())
            chunks.append((current_chunk.strip(), start_line, end_line))
    
    # Post-process: if any chunk is still too large, split by sentences
    final_chunks = []
    for chunk_text, start_line, end_line in chunks:
        if len(chunk_text) <= max_chunk_size:
            final_chunks.append((chunk_text, start_line, end_line))
        else:
            # Split large chunk by sentences
            sentences = split_into_sentences(chunk_text)
            sub_chunk = ""
            
            for sentence in sentences:
                if sub_chunk and len(sub_chunk + " " + sentence) > max_chunk_size:
                    if len(sub_chunk) >= min_chunk_size:
                        sub_start, sub_end = find_line_positions(text, sub_chunk.strip())
                        final_chunks.append((sub_chunk.strip(), sub_start, sub_end))
                        sub_chunk = sentence
                    else:
                        sub_chunk += " " + sentence
                else:
                    if sub_chunk:
                        sub_chunk += " " + sentence
                    else:
                        sub_chunk = sentence
            
            if sub_chunk.strip():
                sub_start, sub_end = find_line_positions(text, sub_chunk.strip())
                final_chunks.append((sub_chunk.strip(), sub_start, sub_end))
    
    return final_chunks


def process_text_files():
    """
    Process all text files in the txt-files directory and create chunks
    in the files directory.
    """
    # Define directories
    txt_dir = Path("txt-files")
    output_dir = Path("files")
    
    # Create output directory if it doesn't exist
    output_dir.mkdir(exist_ok=True)
    
    # Clear existing files from output directory
    clear_directory(output_dir)
    
    # Check if txt-files directory exists
    if not txt_dir.exists():
        print(f"Error: Directory '{txt_dir}' does not exist!")
        return
    
    # Get all text files
    txt_files = list(txt_dir.glob("*.txt"))
    
    if not txt_files:
        print(f"No text files found in '{txt_dir}' directory!")
        return
    
    print(f"Found {len(txt_files)} text files to process...")
    
    total_chunks = 0
    successful_files = 0
    failed_files = 0
    
    for txt_file in txt_files:
        try:
            print(f"Processing: {txt_file.name}")
            
            # Read the text file
            with open(txt_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Create chunks
            chunks = create_chunks(content)
            
            # Determine chunk type for metadata
            chunk_type = "Conversational" if detect_conversational_structure(content) else "Regular"
            
            if not chunks:
                print(f"  ⚠ No chunks created from {txt_file.name} (empty or too small)")
                continue
            
            # Save each chunk as a separate file
            base_name = txt_file.stem
            file_chunks = 0
            
            for i, (chunk, start_line, end_line) in enumerate(chunks, 1):
                chunk_filename = f"{base_name}_lines_{start_line:04d}-{end_line:04d}.txt"
                chunk_path = output_dir / chunk_filename
                
                # Create chunk with metadata header
                chunk_content = f"Source File: {txt_file.name}\n"
                chunk_content += f"Chunk: {i} of {len(chunks)}\n"
                chunk_content += f"Lines: {start_line}-{end_line}\n"
                chunk_content += f"Characters: {len(chunk)}\n"
                chunk_content += f"Type: {chunk_type}\n"
                chunk_content += "-" * 50 + "\n\n"
                chunk_content += chunk
                
                with open(chunk_path, 'w', encoding='utf-8') as f:
                    f.write(chunk_content)
                
                file_chunks += 1
            
            print(f"  ✓ Created {file_chunks} chunks")
            total_chunks += file_chunks
            successful_files += 1
            
        except Exception as e:
            print(f"  ✗ Error processing {txt_file.name}: {str(e)}")
            failed_files += 1
    
    # Print summary
    print(f"\nChunking complete!")
    print(f"Successfully processed: {successful_files} files")
    print(f"Total chunks created: {total_chunks}")
    if failed_files > 0:
        print(f"Failed to process: {failed_files} files")
    
    print(f"Chunk files saved in: {output_dir.absolute()}")


if __name__ == "__main__":
    process_text_files()