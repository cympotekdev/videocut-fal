# videocut-fal — AI 视频剪辑 Agent（fal.ai 版）

> Fork 自 [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills)，将火山引擎替换为 [fal.ai](https://fal.ai) Whisper API

用 Claude Code Skills 构建的视频剪辑 Agent，专为口播视频设计。

## 与原版的差异

| | 原版 (Ceeon) | 本版 (fal.ai) |
|--|-------------|--------------|
| **语音转录** | 火山引擎 ASR | fal.ai Whisper v3 Large (`fal-ai/whisper`) |
| **API Key** | `VOLCENGINE_API_KEY` | `FAL_KEY` |
| **热词功能** | ✅ API 原生支持 | ❌ 由 Agent 词典校对替代 |
| **字级别时间戳** | ✅ | ✅ (`chunk_level=word`，需用 `fal-ai/whisper`) |
| **中文支持** | ✅ | ✅ (`language=zh`) |
| **地域限制** | 需中国手机号注册 | 全球可用 |
| **计费方式** | 预付套餐 | 按使用量 |

## 痛点与方案

剪映的"智能剪口播"有两个痛点：

- **无法理解语义**：重复说的句子、说错后纠正的内容，它识别不出来
- **字幕质量差**：专业术语经常识别错误

这个 Agent 用 Claude 的语义理解能力解决第一个问题，用自定义词典解决第二个问题。

## 功能对比

| 功能 | 说明 | 对比剪映 |
|------|------|---------|
| 语义理解 | AI 逐句分析，识别重说/纠正/卡顿 | 只能模式匹配 |
| 静音检测 | >0.3s 自动标记，可调阈值 | 固定阈值 |
| 重复句检测 | 相邻句开头≥5字相同 → 删前保后 | 无此功能 |
| 句内重复 | "好我们接下来好我们接下来做" → 删重复 | 无此功能 |
| 词典纠错 | 自定义专业术语词典 | 无此功能 |
| 自更新 | 记住你的偏好，越用越准 | 无此功能 |

## 安装

```bash
# 克隆到 Claude Code skills 目录
git clone https://github.com/cympotekdev/videocut-fal.git ~/.claude/skills/videocut

cd ~/.claude/skills/videocut
cp .env.example .env
# 编辑 .env，填入 fal.ai API Key
```

获取 API Key: https://fal.ai/dashboard/keys

在 Claude Code 中输入：

```
/videocut:安装
```

AI 会自动检查 Node.js、FFmpeg 等依赖。

## 使用流程

```
┌─────────────────────────────────────────────┐
│ /videocut:安装 → 首次使用，检查环境         │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ /videocut:剪口播 视频.mp4                   │
│                                             │
│ 1. 提取音频 → 上传云端                      │
│ 2. fal.ai Whisper 转录 → 字级别时间戳        │
│ 3. AI 审核：静音/口误/重复/语气词           │
│ 4. 生成审核网页 → 浏览器打开                │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ 【人工审核 + 执行剪辑】                     │
│                                             │
│ - 单击跳转播放                              │
│ - 双击选中/取消                             │
│ - Shift 拖动多选                            │
│ - 确认后点击「执行剪辑」→ FFmpeg 剪辑       │
└─────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────┐
│ /videocut:字幕                              │
│                                             │
│ - Whisper 转录                               │
│ - 词典纠错                                  │
│ - 人工确认 → 烧录字幕                       │
└─────────────────────────────────────────────┘
```

## 目录结构

```
videocut/
├── README.md
├── .env.example          # FAL_KEY 配置模板
├── 安装/                  # 环境安装 skill
├── 剪口播/                # 核心：转录 + AI 审核 + 剪辑
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── fal_transcribe.sh      # fal.ai Whisper 转录
│   │   ├── generate_subtitles.js  # 生成字级别字幕
│   │   ├── generate_review.js     # 生成审核网页
│   │   ├── review_server.js       # 审核+剪辑服务器
│   │   └── cut_video.sh           # FFmpeg 精确剪辑
│   └── 用户习惯/           # 审核规则（可自定义）
├── 字幕/                  # 字幕生成与烧录
│   ├── scripts/
│   │   └── subtitle_server.js
│   └── 词典.txt            # 自定义词典
└── 自进化/                # 自我进化机制
```

## 架构

```
┌──────────────────┐     ┌──────────────────┐
│ fal.ai Whisper    │────▶│ 字级别时间戳     │
│（Whisper v3）     │     │ fal_result.json  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ Claude Code      │────▶│ AI 审核结果      │
│（语义分析）       │     │ auto_selected    │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ 审核网页         │────▶│ 最终删除列表     │
│（人工确认）       │     │ delete_segments  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
┌──────────────────┐     ┌──────────────────┐
│ FFmpeg           │────▶│ 剪辑后视频       │
│ filter_complex   │     │ xxx_cut.mp4      │
└──────────────────┘     └──────────────────┘
```

## 依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Node.js 18+ | 运行脚本 | `brew install node` |
| FFmpeg | 音视频处理 | `brew install ffmpeg` |
| Python 3 | JSON 解析 | 系统自带 |
| fal.ai API | 语音转录 | [获取 Key](https://fal.ai/dashboard/keys) |

## fal.ai 模型参考

| 模型 | 端点 | 用途 | 字级别时间戳 |
|------|------|------|-------------|
| **Whisper** | `fal-ai/whisper` | 语音转录（Whisper v3 Large）| ✅ `chunk_level=word` |
| ElevenLabs STT | `fal-ai/elevenlabs/speech-to-text` | ElevenLabs 语音转文字 | ❌ |

本项目使用 `fal-ai/whisper`，支持 `chunk_level=word` 获取字级别时间戳。

> ⚠️ **注意**: `fal-ai/wizper` (Whisper 优化版) 不支持 `chunk_level=word`，仅支持 `segment`，因此不适用于本项目。

## 致谢

- 原始项目: [Ceeon/videocut-skills](https://github.com/Ceeon/videocut-skills)
- 转录引擎: [fal.ai Whisper](https://fal.ai/models/fal-ai/whisper)
- 语音模型: [OpenAI Whisper](https://github.com/openai/whisper)

## License

MIT
