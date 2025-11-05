#!/usr/bin/env python3
"""
Async LLM Test Script

This script makes an asynchronous request to the LLM API using the configuration
from config.json with a test prompt. Uses async/await for non-blocking requests.
"""

import json
import aiohttp
import aiofiles
import asyncio
import time


async def load_config(config_path="config.json"):
    """Load configuration from JSON file asynchronously."""
    async with aiofiles.open(config_path, 'r', encoding='utf-8') as f:
        content = await f.read()
        return json.loads(content)


async def make_llm_request_async(prompt, config):
    """Make an async request to the external LLM API."""
    llm_config = config["external_llm"]
    
    # Get API details from config
    api_url = llm_config["url"]
    payload_type = llm_config.get("payload_type", "prompt")
    
    # Prepare payload based on type
    if payload_type == "message":
        # OpenAI-style message format
        payload = {
            "model": llm_config["model"],
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "max_tokens": llm_config["max_tokens"],
            "temperature": llm_config.get("temperature", 0.7)
        }
    else:
        # Ollama-style prompt format (default)
        payload = {
            "model": llm_config["model"],
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": llm_config["max_tokens"],
                "temperature": llm_config.get("temperature", 0.7)
            }
        }
    
    # Prepare headers
    headers = llm_config.get("headers", {})
    if not headers:
        headers = {"Content-Type": "application/json"}
    
    print(f"🌐 Making async request to: {api_url}")
    print(f"📝 Model: {llm_config['model']}")
    print(f"🔧 Payload type: {payload_type}")
    print(f"📊 Max tokens: {llm_config['max_tokens']}")
    print("=" * 60)
    
    # Print exact lengths for debugging
    if payload_type == "message":
        message_content = payload["messages"][0]["content"]
        print(f"📏 EXACT LENGTHS:")
        print(f"   📝 Prompt length: {len(prompt)} characters")
        print(f"   💬 Message content length: {len(message_content)} characters")
        print(f"   📦 Full payload length: {len(json.dumps(payload))} characters")
    else:
        print(f"📏 EXACT LENGTHS:")
        print(f"   📝 Prompt length: {len(prompt)} characters") 
        print(f"   📦 Full payload length: {len(json.dumps(payload))} characters")
    print("=" * 60)
    
    # Pretty print the request payload
    print("📤 REQUEST PAYLOAD:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("=" * 60)
    
    try:
        start_time = time.time()
        
        # Use aiohttp for async HTTP requests
        timeout = aiohttp.ClientTimeout(total=llm_config["timeout"])
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                api_url,
                json=payload,
                headers=headers
            ) as response:
                processing_time = time.time() - start_time
                
                # Check if request was successful
                response.raise_for_status()
                result = await response.json()
                
                print(f"✅ Async request successful! ({processing_time:.2f}s)")
                print("=" * 60)
                
                # Pretty print the raw API response
                print("📥 RAW API RESPONSE:")
                print(json.dumps(result, indent=2, ensure_ascii=False))
                print("=" * 60)
                
                # Extract response text based on payload type
                if payload_type == "message":
                    # OpenAI-style response format
                    if "choices" in result and len(result["choices"]) > 0:
                        response_text = result["choices"][0]["message"]["content"].strip()
                    elif "content" in result:
                        response_text = result["content"].strip()
                    else:
                        response_text = f"❌ Unexpected message API response format: {result}"
                else:
                    # Ollama-style response format (default)
                    if "response" in result:
                        response_text = result["response"].strip()
                    else:
                        response_text = f"❌ Unexpected prompt API response format: {result}"
                
                return response_text, processing_time
        
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        processing_time = time.time() - start_time if 'start_time' in locals() else 0.0
        error_msg = f"❌ Error communicating with LLM API: {e}"
        print(error_msg)
        return error_msg, processing_time


async def run_test(test_name, prompt, config):
    """Run a single test with the given prompt."""
    print(f"\n🧪 TEST: {test_name}")
    print("=" * 80)
    print(f"📝 Prompt length: {len(prompt)} characters")
    print("🔄 Sending async request...")
    print("=" * 60)
    
    # Make the async request
    response_text, processing_time = await make_llm_request_async(prompt, config)
    
    # Display extracted response
    print(f"📋 EXTRACTED RESPONSE ({test_name}):")
    print("=" * 60)
    print(response_text)
    print("=" * 60)
    print(f"⏱️  Processing time: {processing_time:.2f} seconds")
    print(f"📊 Response length: {len(response_text)} characters")
    
    return response_text, processing_time


async def main():
    """Main async function to test the LLM API with two scenarios."""
    print("🚀 Async LLM Dual Test Script")
    print("=" * 80)
    print("🎯 Running two tests: FAISS Enhanced (with context) vs Direct LLM (no context)")
    print("=" * 80)
    
    # Load configuration asynchronously
    try:
        config = await load_config()
        print("✅ Configuration loaded successfully")
    except Exception as e:
        print(f"❌ Failed to load config: {e}")
        return
    
    # Base question without context
    base_question = """# Kysymys
Mitä pidetään tärkeimpänä asiana?

# Ohjeet
Vastaa kysymykseen.
Käytä kontekstia, jos se on saatavilla."""
    
    # Test 1: FAISS Enhanced (with context)
    faiss_prompt = """QUERY METADATA
================
Timestamp: 2025-09-30 15:27:40
Template: basic_rag
Original Query: Mitä pidetään tärkeimpänä asiana?

FORMATTED PROMPT (WITH FAISS CONTEXT)
=====================================
<konteksti>

Source File: L1.txt
Chunk: 3 of 19
Lines: 28-52
Characters: 1896
Type: Conversational
--------------------------------------------------

K: [naurahtaa] No mutta katotaan mihin päästään. Mul on tässä muutamia kysymyksiä. Niin otetaan ihan alkuun vapaa sana. Miten sä käsität jutun kärjen? Mitä se tarkoittaa?

V: Semmosessa uutisrakennetta noudattavassa tekstissä jutun kärkeen laitetaan, eli siis siihen siis jutun alkuun, tälleen yleistäen sanottuna, laitetaan ne tärkeimmät uudet asiat, joita se uutinen tai juttu tuo julki.

K: Elikkä hahmotat sen tällasena rakenteellisena asiana?

V: Joo.

K: Ennemminkin ku sisällöllisenä vai? Kumpi (--) [0:04:23 pp]

V: Rakenteellisena mä sen enemmän hahmotan. Tai mun mielestä kärki ja näkökulma on ehkä eri asia.

K: Niinpä. Joo. Kärki, näkökulma, idea. Tässä ehkä vähän liipataan näitä samoja. Miten... Tai ne limittyvät tietysti. Miten sä hahmottaisit sitten, että miten tää kärki eroaa siitä näkökulmasta?

V: Mun mielestä uutiskärki on ehkä enemmän semmonen tekninen ratkaisu. Et mitä sieltä jutusta poimitaan siihen, nostetaan tärkeimmäks. Ja näkökulma taas on semmonen, että mistä, millä tavalla sitä aihetta käsitellään. Semmosessa, uutisten joukossa, kun on monta juttua, jotka käsittelee samaa aihetta, niin sitten tietysti sitä pitää käsitellä erilaisista näkökulmista.

K: Entä, miten se eroaa niinkö jutun ideasta sitten?

V: Joo, mä en tiiä, ehkä se jutun idea on sitten laajempi asia.

K: Miten sanottaisit, millainen on hyvä jutun kärki?

V: No... Ehkä uutisissa se on informatiivinen ja semmonen, että lukija saa jo, pääsee jo heti jutun alusta kartalle siitä, että mitä se käsittelee, se uutinen, ja miksi se on uutinen. Ne tärkeimmät asiat on siinä kärjessä. Mut sitten pidemmässä jutussa, niin se kärki tai alku voi olla myös semmonen, joka jotenkin koukuttaa sen lukijan. Houkuttelee lukemaan sitä pidemmälle. Se voi olla myös hauska tai outo.

K: Elikkä jos on tällanen feature-pätkä, niin sitten miten näitä sitten sanottaisit, että minkälaisia kärkiä niissä voi olla?

</konteksti>

""" + base_question
    
    # Run both tests
    try:
        faiss_response, faiss_time = await run_test("FAISS Enhanced (with context)", faiss_prompt, config)
        
        # Comparison summary
        print("\n� COMPARISON SUMMARY")
        print("=" * 80)
        print(f"🔍 FAISS Enhanced:")
        print(f"   ⏱️  Time: {faiss_time:.2f}s")
        print(f"   📏 Length: {len(faiss_response)} chars")
        print(f"   📝 Prompt: {len(faiss_prompt)} chars (with context)")
        print("\n✅ Async test completed!")
        
    except Exception as e:
        print(f"❌ Test execution failed: {e}")


if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main())