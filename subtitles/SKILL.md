---
name: videocut:subtitles
description: 字幕產生與燒錄。fal.ai 轉錄→字典糾錯→審核→燒錄。觸發詞：加字幕、產生字幕、字幕
---

# 字幕

> 轉錄 → Agent 校對 → 人工審核 → 燒錄

## 核心流程

```
1. 擷取音訊 + 上傳          ⏱ ~1min
    ↓
2. fal.ai Whisper 轉錄      ⏱ ~2min
    ↓
3. Agent 自動校對            ⏱ ~3-5min
    ↓
4. 人工審核確認              ⏱ 看使用者
    ↓
5. 燒錄字幕                  ⏱ ~1-2min
```

---

## Step 1: 擷取音訊並上傳

```bash
ffmpeg -i "video.mp4" -vn -acodec libmp3lame -y audio.mp3
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
```

---

## Step 2: fal.ai Whisper 轉錄

轉錄腳本使用 fal.ai Whisper（Whisper v3 Large），支援字級別時間戳：

```bash
bash ../narration-cut/scripts/fal_transcribe.sh "https://o.uguu.se/xxxxx.mp3"
```

> 注意：fal.ai 原生不支援熱詞功能。如需專業術語糾錯，請在 Step 3 由 Agent 根據字典手動校對。

**字典格式**（`subtitles/dictionary.txt`，每行一個詞）：
```
skills
Claude
Agent
```

---

## Step 3: Agent 自動校對

### 3.1 產生帶時間戳的字幕

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

### 3.2 Agent 手動校對

轉錄後，Agent 一定要逐條閱讀全部字幕，結合 `subtitles/dictionary.txt` 校對：

#### 常見誤辨識規則表

| 誤辨識 | 正確 | 類型 |
|--------|------|------|
| cloud code | Claude Code | 發音相似 |
| Schill/skill | skills | 發音相似 |
| 正特/整特 | Agent | 誤辨識 |
| a p i t/APIK | API Key | 誤辨識 |

---

## Step 4: 啟動審核伺服器

```bash
node <skill 路徑>/subtitles/scripts/subtitle_server.js 8898 "video.mp4"
```

---

## Step 5: 燒錄字幕

```bash
ffmpeg -i "video.mp4" \
  -vf "subtitles='video.srt':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy -y "video_subtitled.mp4"
```

## 字幕規範

| 規則 | 說明 |
|------|------|
| 一螢幕一行 | 不換行 |
| 句尾不加標點 | `你好` 而不是 `你好。` |
| 句中保留標點 | `先點這裡，再點那裡` |
