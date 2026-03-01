# videocut-fal — AI Video Editing Agent (fal.ai Edition)

> Forked from [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills), replacing Volcano Engine ASR with [fal.ai](https://fal.ai) Whisper API

AI-powered video editing agent built with Claude Code Skills, designed for narration videos.

## Differences from Original

| | Original (Ceeon) | This Fork (fal.ai) |
|--|-------------|--------------|
| **Speech-to-Text** | Volcano Engine ASR | fal.ai Whisper v3 Large (`fal-ai/whisper`) |
| **API Key** | `VOLCENGINE_API_KEY` | `FAL_KEY` |
| **Hot Words** | ✅ Native API support | ❌ Agent dictionary proofreading instead |
| **Word-level Timestamps** | ✅ | ✅ (`chunk_level=word`, requires `fal-ai/whisper`) |
| **Region Restriction** | Requires Chinese phone number | Available worldwide |
| **Billing** | Prepaid packages | Pay-per-use |

## Problem & Solution

CapCut's "Smart Narration Cut" has two pain points:

- **No semantic understanding**: Can't detect repeated sentences or self-corrections
- **Poor subtitle quality**: Professional terms often misrecognized

This agent uses Claude's semantic understanding to solve the first problem, and custom dictionaries for the second.

## Feature Comparison

| Feature | Description | vs CapCut |
|---------|-------------|---------|
| Semantic Analysis | AI analyzes each sentence for redo/correction/stuttering | Pattern matching only |
| Silence Detection | >0.3s auto-tagged, adjustable threshold | Fixed threshold |
| Repeated Sentences | Adjacent sentences with ≥5 same starting chars → delete shorter | Not available |
| In-sentence Repeat | "okay let's okay let's do this" → delete duplicate | Not available |
| Dictionary Correction | Custom professional terminology dictionary | Not available |
| Self-evolution | Remembers your preferences, improves over time | Not available |

## Installation

```bash
# Clone to Claude Code skills directory
git clone https://github.com/cympotekdev/videocut-fal.git ~/.claude/skills/videocut

cd ~/.claude/skills/videocut
cp .env.example .env
# Edit .env and fill in your fal.ai API Key
```

Get API Key: https://fal.ai/dashboard/keys

In Claude Code:

```
/videocut:setup
```

AI will automatically check Node.js, FFmpeg and other dependencies.

## Workflow

```
┌─────────────────────────────────────────────┐
│ /videocut:setup → First time setup          │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ /videocut:narration-cut video.mp4           │
│                                             │
│ 1. Extract audio → upload to cloud          │
│ 2. fal.ai Whisper STT → word timestamps    │
│ 3. AI review: silence/flubs/repeats/fillers │
│ 4. Generate review page → open in browser   │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ 【Manual Review + Execute Cut】             │
│                                             │
│ - Click to jump playback                    │
│ - Double-click to select/deselect           │
│ - Shift+drag for batch select               │
│ - Confirm then click「Execute Cut」→ FFmpeg │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ /videocut:subtitles                         │
│                                             │
│ - Whisper transcription                     │
│ - Dictionary correction                     │
│ - Manual review → burn subtitles            │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
videocut/
├── README.md
├── .env.example              # FAL_KEY config template
├── setup/                    # Environment setup skill
├── narration-cut/            # Core: transcribe + AI review + cut
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── fal_transcribe.sh      # fal.ai Whisper transcription
│   │   ├── generate_subtitles.js  # Generate word-level subtitles
│   │   ├── generate_review.js     # Generate review web page
│   │   ├── review_server.js       # Review + cut server
│   │   └── cut_video.sh           # FFmpeg precise cutting
│   └── user-rules/                # Review rules (customizable)
├── subtitles/                # Subtitle generation & burning
│   ├── scripts/
│   │   └── subtitle_server.js
│   └── dictionary.txt        # Custom dictionary
└── self-evolve/              # Self-evolution mechanism
```

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│ fal.ai Whisper   │────▶│ Word Timestamps  │
│ (Whisper v3)     │     │ fal_result.json  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ Claude Code      │────▶│ AI Review Result │
│ (Semantic)       │     │ auto_selected    │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ Review Page      │────▶│ Final Cut List   │
│ (Manual Review)  │     │ delete_segments  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ FFmpeg           │────▶│ Cut Video        │
│ filter_complex   │     │ xxx_cut.mp4      │
└──────────────────┘     └──────────────────┘
```

## Dependencies

| Dependency | Purpose | Installation |
|------------|---------|-------------|
| Node.js 18+ | Run scripts | `brew install node` |
| FFmpeg | Audio/video processing | `brew install ffmpeg` |
| Python 3 | JSON parsing | Pre-installed |
| fal.ai API | Speech-to-text | [Get Key](https://fal.ai/dashboard/keys) |

## fal.ai Model Reference

| Model | Endpoint | Purpose | Word Timestamps |
|-------|----------|---------|-----------------|
| **Whisper** | `fal-ai/whisper` | Speech-to-text (Whisper v3 Large) | ✅ `chunk_level=word` |
| ElevenLabs STT | `fal-ai/elevenlabs/speech-to-text` | ElevenLabs speech-to-text | ❌ |

This project uses `fal-ai/whisper` with `chunk_level=word` for word-level timestamps.

> ⚠️ **Note**: `fal-ai/wizper` (optimized Whisper variant) does NOT support `chunk_level=word` (only `segment`), so it's not suitable for this project.

## Credits

- Original project: [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills)
- Transcription engine: [fal.ai Whisper](https://fal.ai/models/fal-ai/whisper)
- Speech model: [OpenAI Whisper](https://github.com/openai/whisper)

## License

MIT
