---
name: videocut:narration-cut
description: 口播影片轉錄和口誤辨識。產生審查稿和刪除任務清單。觸發詞：剪口播、處理影片、辨識口誤
---

<!--
input: 影片檔案 (*.mp4)
output: subtitles_words.json、auto_selected.json、review.html
pos: 轉錄+辨識，到使用者網頁審核為止

原專案: https://github.com/Ceeon/videocut-skills (火山引擎版)
本專案: 改用 fal.ai Whisper v3 Large (`fal-ai/whisper`) 替代火山引擎
注意: 不要用 fal-ai/wizper，它不支援 chunk_level=word
-->

# 剪口播 v2 (fal.ai 版)

> fal.ai Whisper 轉錄 + AI 口誤辨識 + 網頁審核

## 快速使用

```
使用者: 幫我剪這個口播影片
使用者: 處理一下這個影片
```

## 輸出目錄結構

```
output/
└── YYYY-MM-DD_影片名/
    ├── narration-cut/
    │   ├── 1_transcription/
    │   │   ├── audio.mp3
    │   │   ├── fal_result.json
    │   │   └── subtitles_words.json
    │   ├── 2_analysis/
    │   │   ├── readable.txt
    │   │   ├── auto_selected.json
    │   │   └── flub_analysis.md
    │   └── 3_review/
    │       └── review.html
    └── subtitles/
        └── ...
```

**規則**：已有資料夾就複用，否則新建。

## 流程

```
0. 建立輸出目錄
    ↓
1. 擷取音訊 (ffmpeg)
    ↓
2. 上傳取得公開 URL (uguu.se)
    ↓
3. fal.ai Whisper API 轉錄（字級別時間戳）
    ↓
4. 產生字級別字幕 (subtitles_words.json)
    ↓
5. AI 分析口誤/靜音，產生預選清單 (auto_selected.json)
    ↓
6. 產生審核網頁 (review.html)
    ↓
7. 啟動審核伺服器，使用者在網頁確認
    ↓
【等待使用者確認】→ 網頁點選「執行剪輯」或手動 /剪輯
```

## 執行步驟

### 步驟 0: 建立輸出目錄

```bash
VIDEO_PATH="/path/to/影片.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}/narration-cut"

mkdir -p "$BASE_DIR/1_transcription" "$BASE_DIR/2_analysis" "$BASE_DIR/3_review"
cd "$BASE_DIR"
```

### 步驟 1-3: 轉錄

```bash
cd 1_transcription

# 1. 擷取音訊
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# 2. 上傳取得公開 URL
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# 回傳: {"success":true,"files":[{"url":"https://h.uguu.se/xxx.mp3"}]}

# 3. 呼叫 fal.ai Whisper API
SKILL_DIR="<skill 安裝路徑>/narration-cut"
"$SKILL_DIR/scripts/fal_transcribe.sh" "https://h.uguu.se/xxx.mp3"
# 輸出: fal_result.json
```

### 步驟 4: 產生字幕

```bash
node "$SKILL_DIR/scripts/generate_subtitles.js" fal_result.json
# 輸出: subtitles_words.json

cd ..
```

### 步驟 5: 分析口誤（腳本+AI）

#### 5.1 產生易讀格式

```bash
cd 2_analysis

node -e "
const data = require('../1_transcription/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[靜' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\\n'));
"
```

#### 5.2 讀取使用者偏好

先讀 `user-rules/` 目錄下所有規則檔案。

#### 5.3 產生句子列表（關鍵步驟）

**一定要先分句，再分析**。依靜音切分成句子列表：

```bash
node -e "
const data = require('../1_transcription/subtitles_words.json');
let sentences = [];
let curr = { text: '', startIdx: -1, endIdx: -1 };

data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);

sentences.forEach((s, i) => {
  console.log(i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text);
});
" > sentences.txt
```

#### 5.4 腳本自動標記靜音（一定要先執行）

```bash
node -e "
const words = require('../1_transcription/subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('auto_selected.json', JSON.stringify(selected, null, 2));
console.log('≥0.5s 靜音數量:', selected.length);
"
```

#### 5.5 AI 分析口誤（追加到 auto_selected.json）

**偵測規則（依優先順序）**：

| # | 類型 | 判斷方式 | 刪除範圍 |
|---|------|----------|----------|
| 1 | 重複句 | 相鄰句子開頭 ≥5 字相同 | 較短的**整句** |
| 2 | 隔一句重複 | 中間是殘句時，比對前後句 | 前句+殘句 |
| 3 | 殘句 | 話講一半+靜音 | **整個殘句** |
| 4 | 句內重複 | A+中間+A 模式 | 前面部分 |
| 5 | 卡頓詞 | 那個那個、就是就是 | 前面部分 |
| 6 | 重說糾正 | 部分重複/否定糾正 | 前面部分 |
| 7 | 語氣詞 | 嗯、啊、那個 | 標記但不自動刪 |

**核心原則**：
- **先分句，再比對**：用 sentences.txt 比對相鄰句子
- **整句刪除**：殘句、重複句都要刪整句

**分段分析（迴圈執行）**：

```
1. Read readable.txt offset=N limit=300
2. 結合 sentences.txt 分析這 300 行
3. 追加口誤 idx 到 auto_selected.json
4. 記錄到 flub_analysis.md
5. N += 300，回到步驟 1
```

🚨 **關鍵警告：行號 ≠ idx**

```
readable.txt 格式: idx|內容|時間
                   ↑ 用這個值
```

### 步驟 6-7: 審核

```bash
cd ../3_review

# 6. 產生審核網頁
node "$SKILL_DIR/scripts/generate_review.js" ../1_transcription/subtitles_words.json ../2_analysis/auto_selected.json ../1_transcription/audio.mp3
# 輸出: review.html

# 7. 啟動審核伺服器
node "$SKILL_DIR/scripts/review_server.js" 8899 "$VIDEO_PATH"
# 開啟 http://localhost:8899
```

## 資料格式

### subtitles_words.json

```json
[
  {"text": "大", "start": 0.12, "end": 0.2, "isGap": false},
  {"text": "", "start": 6.78, "end": 7.48, "isGap": true}
]
```

### auto_selected.json

```json
[72, 85, 120]
```

## 設定

### fal.ai API Key

```bash
cp .env.example .env
# 編輯 .env 填入 FAL_KEY=xxx
```

取得 Key: https://fal.ai/dashboard/keys

### 模型說明

本專案使用 `fal-ai/whisper`（Whisper v3 Large）：
- 支援 `chunk_level=word` 取得字級別時間戳
- 支援中文（`language=zh`）
- 非同步佇列模式，支援長音訊
- API 文件: https://fal.ai/models/fal-ai/whisper/api

> ⚠️ 不要用 `fal-ai/wizper`，它只支援 `chunk_level=segment`，無法取得字級別時間戳。
