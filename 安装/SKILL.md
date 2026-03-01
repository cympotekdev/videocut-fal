---
name: videocut:安装
description: 环境准备。安装依赖、配置 API Key、验证环境。触发词：安装、环境准备、初始化
---

# 安装

> 首次使用前的环境准备

## 快速使用

```
用户: 安装环境
用户: 初始化
```

## 依赖清单

| 依赖 | 用途 | 安装命令 |
|------|------|----------|
| Node.js | 运行脚本 | `brew install node` |
| FFmpeg | 视频剪辑 | `brew install ffmpeg` |
| curl | API 调用 | 系统自带 |
| Python 3 | JSON 解析 | 系统自带 |

## API 配置

### fal.ai Whisper（语音转录）

模型端点: `fal-ai/whisper`（支持 `chunk_level=word` 字级别时间戳）
控制台: https://fal.ai/dashboard/keys

1. 注册 fal.ai 账号
2. 获取 API Key
3. 无需额外开通服务，按使用量计费

> ⚠️ 不要用 `fal-ai/wizper`，它不支持字级别时间戳。

配置到项目 `.env`：

```bash
cp .env.example .env
# 编辑 .env 填入:
FAL_KEY=your_fal_key_here
```

## 安装流程

```
1. 安装 Node.js + FFmpeg
       ↓
2. 配置 fal.ai API Key
       ↓
3. 验证环境
```

## 执行步骤

### 1. 安装依赖

```bash
# macOS
brew install node ffmpeg

# 验证
node -v
ffmpeg -version
python3 --version
```

### 2. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env 填入 FAL_KEY
```

### 3. 验证环境

```bash
node -v
ffmpeg -version
cat .env | grep FAL_KEY
```

## 常见问题

### Q1: API Key 在哪获取？

fal.ai 控制台 → Dashboard → Keys → Create Key

### Q2: 支持哪些音频格式？

fal.ai Whisper 支持: mp3, mp4, mpeg, mpga, m4a, wav, webm

### Q3: 费用如何？

fal.ai 按使用量计费，Whisper 模型价格参见:
https://fal.ai/models/fal-ai/whisper
