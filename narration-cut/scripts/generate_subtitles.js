#!/usr/bin/env node
/**
 * 從 fal.ai Whisper 結果產生字級別字幕
 *
 * fal.ai Whisper 輸出格式 (chunk_level=word):
 * {
 *   "text": "全文",
 *   "chunks": [
 *     { "text": "你", "timestamp": [0.0, 0.2] },
 *     { "text": "好", "timestamp": [0.2, 0.4] },
 *     ...
 *   ]
 * }
 *
 * 用法: node generate_subtitles.js <fal_result.json> [delete_segments.json]
 * 輸出: subtitles_words.json
 */

const fs = require('fs');

const resultFile = process.argv[2] || 'fal_result.json';
const deleteFile = process.argv[3];

if (!fs.existsSync(resultFile)) {
  console.error('❌ 找不到檔案:', resultFile);
  process.exit(1);
}

const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));

// 從 fal.ai Whisper 格式擷取字級別資料
const allWords = [];

if (result.chunks && Array.isArray(result.chunks)) {
  for (const chunk of result.chunks) {
    if (chunk.timestamp && chunk.text) {
      allWords.push({
        text: chunk.text.trim(),
        start: chunk.timestamp[0],
        end: chunk.timestamp[1]
      });
    }
  }
} else if (result.utterances) {
  // 相容火山引擎格式（向下相容）
  for (const utterance of result.utterances) {
    if (utterance.words) {
      for (const word of utterance.words) {
        allWords.push({
          text: word.text,
          start: word.start_time / 1000,
          end: word.end_time / 1000
        });
      }
    }
  }
}

console.log('原始字數:', allWords.length);

// 如果有刪除片段，對映時間
let outputWords = allWords;

if (deleteFile && fs.existsSync(deleteFile)) {
  const deleteSegments = JSON.parse(fs.readFileSync(deleteFile, 'utf8'));
  console.log('刪除片段數:', deleteSegments.length);

  function getDeletedTimeBefore(time) {
    let deleted = 0;
    for (const seg of deleteSegments) {
      if (seg.end <= time) {
        deleted += seg.end - seg.start;
      } else if (seg.start < time) {
        deleted += time - seg.start;
      }
    }
    return deleted;
  }

  function isDeleted(start, end) {
    for (const seg of deleteSegments) {
      if (start < seg.end && end > seg.start) return true;
    }
    return false;
  }

  outputWords = [];
  for (const word of allWords) {
    if (!isDeleted(word.start, word.end)) {
      const deletedBefore = getDeletedTimeBefore(word.start);
      outputWords.push({
        text: word.text,
        start: Math.round((word.start - deletedBefore) * 100) / 100,
        end: Math.round((word.end - deletedBefore) * 100) / 100
      });
    }
  }
  console.log('對映後字數:', outputWords.length);
}

// 新增空白標記（>0.5秒的静音按1秒拆分，便于精细控制）
const wordsWithGaps = [];
let lastEnd = 0;

for (const word of outputWords) {
  const gapDuration = word.start - lastEnd;

  if (gapDuration > 0.1) {
    if (gapDuration > 0.5) {
      let gapStart = lastEnd;
      while (gapStart < word.start) {
        const gapEnd = Math.min(gapStart + 1, word.start);
        wordsWithGaps.push({
          text: '',
          start: Math.round(gapStart * 100) / 100,
          end: Math.round(gapEnd * 100) / 100,
          isGap: true
        });
        gapStart = gapEnd;
      }
    } else {
      wordsWithGaps.push({
        text: '',
        start: Math.round(lastEnd * 100) / 100,
        end: Math.round(word.start * 100) / 100,
        isGap: true
      });
    }
  }

  wordsWithGaps.push({
    text: word.text,
    start: word.start,
    end: word.end,
    isGap: false
  });
  lastEnd = word.end;
}

const gaps = wordsWithGaps.filter(w => w.isGap);
console.log('總元素數:', wordsWithGaps.length);
console.log('空白段數:', gaps.length);

fs.writeFileSync('subtitles_words.json', JSON.stringify(wordsWithGaps, null, 2));
console.log('✅ 已儲存 subtitles_words.json');
