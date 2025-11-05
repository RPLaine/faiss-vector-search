# Optimization & Improvement System

Complete guide to the adaptive optimization and iterative improvement system.

## Overview

The system provides a two-phase approach to generating the best possible responses:

1. **Optimization Phase**: Tests different temperature values to find the best response
2. **Improvement Phase**: Iteratively refines the best response using evaluation feedback

## System Architecture

```
User Query
    ↓
[Temperature Optimization]
    ├─ Test temperature: 0.25 → Evaluate (score)
    ├─ Test temperature: 0.50 → Evaluate (score)
    ├─ Test temperature: 0.75 → Evaluate (score)
    ├─ Test temperature: 1.00 → Evaluate (score)
    └─ Test temperature: 1.25 → Evaluate (score)
    ↓
[Best Response Selected]
    ↓
[Iterative Improvement] (if enabled)
    ├─ Iteration 1: Improve → Evaluate
    ├─ Iteration 2: Improve → Evaluate
    └─ ... (until convergence or degradation)
    ↓
[Final Response]
```

## Phase 1: Temperature Optimization

**Purpose:** Find the optimal temperature value for response generation.

**Process:**
1. Test predefined temperature values (default: [0.25, 0.5, 0.75, 1.0, 1.25])
2. Generate response for each temperature
3. Evaluate each response using LLM self-assessment
4. Select temperature with highest evaluation score

**Evaluation Criteria:**
- Relevanssi (Relevance): 30%
- Kontekstin käyttö (Context Usage): 30%
- Selkeys (Clarity): 20%
- Täydellisyys (Completeness): 20%

**Output:**
- Best temperature value
- Best response text
- Optimization history with all scores
- Response comparison display

## Phase 2: Iterative Improvement

**Purpose:** Refine the best response using evaluation feedback.

**Process:**
1. Start with best response from optimization
2. Evaluate current response
3. If score < target (default: 1.0):
   - Generate improved response using evaluation feedback
   - Evaluate improved response
   - If score improved: continue with new response
   - If score stayed same: converged, stop
   - If score degraded: stop and use previous best
4. Repeat until target reached, convergence, or degradation

**Stopping Conditions:**
1. **Target Score Reached**: Score ≥ 1.0 (perfect response)
2. **Convergence**: Score change ≤ 0.001 (no meaningful improvement)
3. **Degradation**: New score < previous score
4. **Safety Limit**: 50 iterations (prevents infinite loops, rarely reached)

**Output:**
- Final improved response
- Final score
- Improvement history with all iterations
- Stopped reason

## Configuration

### Enable Both Phases

```json
{
    "optimization": {
        "enabled": true,
        "temperature_values": [0.25, 0.5, 0.75, 1.0, 1.25],
        "evaluator": {
            "temperature": 0.1,
            "max_tokens": 500,
            "timeout": 60
        }
    },
    "improvement": {
        "enabled": true,
        "target_score": 1.0,
        "improver": {
            "max_tokens": 2000,
            "timeout": 300
        }
    }
}
```

**Note:** The improvement phase automatically uses the best temperature found during optimization.

### Optimization Only

```json
{
    "optimization": {
        "enabled": true
    },
    "improvement": {
        "enabled": false
    }
}
```

### Disable Both (Standard RAG)

```json
{
    "optimization": {
        "enabled": false
    },
    "improvement": {
        "enabled": false
    }
}
```

## Prompts

The system uses three main prompts (all in Finnish):

### 1. Evaluation Prompt
**Location:** `prompts/evaluation/prompt.txt`

**Purpose:** Critical evaluation of response quality with reasoning + score

**Key Features:**
- Statistical framework (normal distribution, μ=0.50)
- Four evaluation criteria with ranges
- Probability distribution guidance (68% within μ±1σ)
- Critical reminders to avoid extreme scores (0.00/1.00)

**Output Format:**
```
Perustelut: [detailed reasoning]
Pisteet: [0.XX]
```

### 2. Improvement Prompt
**Location:** `prompts/improvement/prompt.txt`

**Purpose:** Generate improved response based on evaluation feedback

**Key Features:**
- Analysis framework (4 criteria with action items)
- General improvement principles (structure, language, sources, content)
- Mandatory corrections checklist
- Output format with 8-point quality checklist

**Input Variables:**
- `{question}`: Original user question
- `{context}`: Retrieved context documents
- `{response}`: Current response to improve
- `{evaluation_feedback}`: Evaluation reasoning + score

**Output:** Improved response text

### 3. Basic RAG Prompt
**Location:** `prompts/basic_rag.txt`

**Purpose:** Standard RAG response generation

## Rich Console Display

The system provides comprehensive visual feedback:

### Optimization Phase
- 🌡️ Temperature values being tested
- 📋 Full evaluation prompts (cyan panels)
- 📝 Raw evaluation responses (yellow panels)
- 🔍 Response comparisons (colored by score)
- 📈 Optimization history table

### Improvement Phase
- 🔧 Improvement prompts (magenta panels, truncated)
- ✨ Improved responses (green panels)
- 📊 Evaluation scores for each iteration
- ✅/❌ Success/degradation indicators
- 📈 Improvement progress table

### Color Coding
- **Green**: Good scores (≥0.70) or improvements
- **Yellow**: Medium scores (0.60-0.69) or warnings
- **Red**: Poor scores (<0.60) or degradations
- **Cyan**: Evaluation phase
- **Magenta**: Improvement phase

## Progress Tables

### Optimization History Table
| # | Temperature | Score | Status |
|---|-------------|-------|--------|
| 1 | 0.25 | 0.65 | ✓ |
| 2 | 0.50 | 0.72 | ✓ |
| 3 | 0.75 | 0.78 | 🏆 Best |
| 4 | 1.00 | 0.71 | ✓ |
| 5 | 1.25 | 0.68 | ✓ |

### Improvement History Table
| Iteration | Score | Change | Action | Status |
|-----------|-------|--------|--------|--------|
| 0 | 0.78 | - | Initial | ✓ |
| 1 | 0.82 | +0.04 | Improved | ✓ |
| 2 | 0.88 | +0.06 | Improved | ✓ |
| 3 | 0.92 | +0.04 | Improved | 🏆 Best |
| 4 | 0.89 | -0.03 | Degraded | ✗ |

**Result:** Iteration 3 used as final (degradation detected at iteration 4)

**Alternative Result 1 (Convergence):**
| Iteration | Score | Change | Action | Status |
|-----------|-------|--------|--------|--------|
| 0 | 0.78 | - | Initial | ✓ |
| 1 | 0.85 | +0.07 | Improved | ✓ |
| 2 | 0.85 | +0.00 | No Change | 🏆 Best |

**Result:** Iteration 1 used as final (convergence at iteration 2)

**Alternative Result 2 (Target Reached):**
| Iteration | Score | Change | Action | Status |
|-----------|-------|--------|--------|--------|
| 0 | 0.78 | - | Initial | ✓ |
| 1 | 0.88 | +0.10 | Improved | ✓ |
| 2 | 0.96 | +0.08 | Improved | ✓ |
| 3 | 1.00 | +0.04 | Improved | 🏆 Best |

**Result:** Iteration 3 used as final (target score 1.0 reached)

## LLM Configuration Strategy

### Evaluation (Low Temperature)
- **Temperature:** 0.1 (consistent, deterministic scoring)
- **Max Tokens:** 500 (reasoning + score)
- **Timeout:** 60s (quick evaluation)

### Improvement (Inherits from Optimization)
- **Temperature:** **Inherited from best optimization result** (uses what works best)
- **Max Tokens:** 2000 (comprehensive response)
- **Timeout:** 300s (allow time for quality)

**Why inherit temperature?** The optimization phase finds the temperature that produces the best responses for your specific use case. Using the same temperature for improvements ensures consistency and leverages what's already proven to work best.

### Standard Generation (Medium Temperature)
- **Temperature:** 0.5 (balanced creativity/consistency)
- **Max Tokens:** 1000 (complete response)
- **Timeout:** 300s (allow time for quality)

## Usage in main.py

The system automatically integrates when running in "Optimized FAISS" mode (option 3):

```python
# User selects "3. FAISS Enhanced + Optimization"
# System automatically:
# 1. Runs temperature optimization
# 2. Displays all response comparisons
# 3. Shows optimization history
# 4. Runs iterative improvement (if enabled)
# 5. Shows improvement history
# 6. Returns final best response
```

## Best Practices

### Configuration Tuning

1. **For Fast Iteration:**
   ```json
   {
       "optimization": {"temperature_values": [0.5, 0.7, 1.0]},
       "improvement": {"target_score": 0.85}
   }
   ```

2. **For Thorough Optimization:**
   ```json
   {
       "optimization": {"temperature_values": [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]},
       "improvement": {"target_score": 0.95}
   }
   ```

3. **For Quality Focus (Improvement Only):**
   ```json
   {
       "optimization": {"enabled": false},
       "improvement": {
           "enabled": true,
           "target_score": 0.98
       }
   }
   ```

### Monitoring Performance

Watch for:
- **Clustering at extremes**: Evaluation scores all 0.00 or 1.00 → Adjust evaluation prompt
- **No improvements**: All improvement iterations degrade → Check improvement prompt
- **Timeouts**: Increase timeout values in config
- **Slow evaluation**: Reduce max_tokens for evaluator

### Prompt Refinement

If evaluation scores are inconsistent:
1. Review evaluation prompt statistical guidance
2. Add more specific criteria examples
3. Strengthen "Ole EPÄILEVÄINEN" (be critical) section
4. Test with known good/bad responses

If improvements aren't effective:
1. Review improvement prompt action items
2. Add more specific transformation examples
3. Ensure evaluation feedback is detailed
4. Test with responses needing specific fixes

## Technical Details

### File Structure
```
components/
  ├─ optimization/
  │   ├─ response_evaluator.py       # LLM-based evaluation
  │   ├─ temperature_optimizer.py    # Temperature testing
  │   └─ optimization_coordinator.py # Orchestrates both phases
  └─ improvement/
      ├─ response_improver.py         # LLM-based improvement
      └─ improvement_coordinator.py   # Iterative improvement loop

prompts/
  ├─ evaluation/
  │   └─ prompt.txt                   # Evaluation prompt (Finnish)
  └─ improvement/
      └─ prompt.txt                   # Improvement prompt (Finnish)
```

### Key Classes

**OptimizationCoordinator:**
- Manages temperature optimization
- Calls ResponseEvaluator for scoring
- Triggers ImprovementCoordinator if enabled
- Returns combined results

**ResponseEvaluator:**
- Loads evaluation prompt from file
- Formats prompt with question/context/response
- Calls LLM with low temperature (0.1)
- Parses reasoning and score

**ImprovementCoordinator:**
- Manages iterative improvement loop
- Tracks best response across iterations
- Stops on degradation or target reached
- Returns final best with history

**ResponseImprover:**
- Loads improvement prompt from file
- Formats prompt with evaluation feedback
- Calls LLM with high temperature (0.7)
- Returns improved response

## Troubleshooting

### "Optimization not enabled"
→ Set `"optimization": {"enabled": true}` in config.json

### "Improvement prompt could not be loaded"
→ Ensure `prompts/improvement/prompt.txt` exists

### "All scores are 1.00"
→ Evaluation prompt may be too lenient, review statistical guidance

### "All scores are 0.00"
→ Evaluation prompt may be too harsh, adjust criteria ranges

### "Improvements always degrade"
→ Check improvement prompt has clear action items and examples

### "Timeout errors"
→ Increase timeout values in config (evaluator: 60→120, improver: 300→600)

---

*For complete configuration reference, see [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md)*
