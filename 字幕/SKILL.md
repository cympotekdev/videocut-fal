---
name: videocut:字幕
description: 字幕生成与烧录。fal.ai 转录→词典纠错→审核→烧录。触发词：加字幕、生成字幕、字幕
---

# 字幕

> 转录 → Agent校对 → 人工审核 → 烧录

## 核心流程

```
1. 提取音频 + 上传          ⏱ ~1min
    ↓
2. fal.ai Whisper 转录       ⏱ ~2min
    ↓
3. Agent 自动校对            ⏱ ~3-5min
    ↓
4. 人工审核确认              ⏱ 取决于用户
    ↓
5. 烧录字幕                  ⏱ ~1-2min
```

---

## Step 1: 提取音频并上传

```bash
ffmpeg -i "video.mp4" -vn -acodec libmp3lame -y audio.mp3
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
```

---

## Step 2: fal.ai Whisper 转录

转录脚本使用 fal.ai Whisper（Whisper v3 Large），支持字级别时间戳：

```bash
bash ../剪口播/scripts/fal_transcribe.sh "https://o.uguu.se/xxxxx.mp3"
```

> 注意：fal.ai 原生不支持热词功能。如需专业术语纠错，请在 Step 3 由 Agent 根据词典手动校对。

**词典格式**（`字幕/词典.txt`，每行一个词）：
```
skills
Claude
Agent
```

---

## Step 3: Agent 自动校对

### 3.1 生成带时间戳的字幕

```javascript
const result = JSON.parse(fs.readFileSync('fal_result.json'));
const subtitles = result.chunks.map((c, i) => ({
  id: i + 1,
  text: c.text.trim(),
  start: c.timestamp[0],
  end: c.timestamp[1]
}));
fs.writeFileSync('subtitles_with_time.json', JSON.stringify(subtitles, null, 2));
```

### 3.2 Agent 手动校对

转录后，Agent 必须逐条阅读全部字幕，结合 `字幕/词典.txt` 校对：

#### 常见误识别规则表

| 误识别 | 正确 | 类型 |
|--------|------|------|
| cloud code | Claude Code | 发音相似 |
| Schill/skill | skills | 发音相似 |
| 正特/整特 | Agent | 误识别 |
| a p i t/APIK | API Key | 误识别 |

---

## Step 4: 启动审核服务器

```bash
node <skill路径>/字幕/scripts/subtitle_server.js 8898 "video.mp4"
```

---

## Step 5: 烧录字幕

```bash
ffmpeg -i "video.mp4" \
  -vf "subtitles='video.srt':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy -y "video_字幕.mp4"
```

## 字幕规范

| 规则 | 说明 |
|------|------|
| 一屏一行 | 不换行 |
| 句尾无标点 | `你好` 不是 `你好。` |
| 句中保留标点 | `先点这里，再点那里` |
