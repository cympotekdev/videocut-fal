---
name: videocut:setup
description: 環境準備。安裝相依套件、設定 API Key、驗證環境。觸發詞：安裝、環境準備、初始化
---

# 安裝設定

> 首次使用前的環境準備

## 快速使用

```
使用者: 安裝環境
使用者: 初始化
```

## 相依套件

| 相依套件 | 用途 | 安裝方式 |
|---------|------|----------|
| Node.js | 執行腳本 | `brew install node` |
| FFmpeg | 影片剪輯 | `brew install ffmpeg` |
| curl | API 呼叫 | 系統內建 |
| Python 3 | JSON 解析 | 系統內建 |

## API 設定

### fal.ai Whisper（語音轉錄）

模型端點: `fal-ai/whisper`（支援 `chunk_level=word` 字級別時間戳）
控制台: https://fal.ai/dashboard/keys

1. 註冊 fal.ai 帳號
2. 取得 API Key
3. 不用額外開通服務，用多少付多少

> ⚠️ 不要用 `fal-ai/wizper`，它不支援字級別時間戳。

設定到專案 `.env`：

```bash
cp .env.example .env
# 編輯 .env 填入:
FAL_KEY=your_fal_key_here
```

## 安裝流程

```
1. 安裝 Node.js + FFmpeg
       ↓
2. 設定 fal.ai API Key
       ↓
3. 驗證環境
```

## 執行步驟

### 1. 安裝相依套件

```bash
# macOS
brew install node ffmpeg

# 驗證
node -v
ffmpeg -version
python3 --version
```

### 2. 設定 API Key

```bash
cp .env.example .env
# 編輯 .env 填入 FAL_KEY
```

### 3. 驗證環境

```bash
node -v
ffmpeg -version
cat .env | grep FAL_KEY
```

## 常見問題

### Q1: API Key 去哪拿？

fal.ai 控制台 → Dashboard → Keys → Create Key

### Q2: 支援哪些音訊格式？

fal.ai Whisper 支援: mp3, mp4, mpeg, mpga, m4a, wav, webm

### Q3: 費用怎麼算？

fal.ai 用多少付多少，Whisper 模型價格請參考:
https://fal.ai/models/fal-ai/whisper
