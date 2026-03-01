#!/bin/bash
#
# 依刪除清單剪輯影片（filter_complex 精确剪辑）
#
# 用法: ./cut_video.sh <input.mp4> <delete_segments.json> [output.mp4]
#

INPUT="$1"
DELETE_JSON="$2"
OUTPUT="${3:-output_cut.mp4}"

if [ -z "$INPUT" ] || [ -z "$DELETE_JSON" ]; then
  echo "❌ 用法: ./cut_video.sh <input.mp4> <delete_segments.json> [output.mp4]"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "❌ 找不到輸入檔案: $INPUT"
  exit 1
fi

if [ ! -f "$DELETE_JSON" ]; then
  echo "❌ 找不到刪除清單: $DELETE_JSON"
  exit 1
fi

# 取得影片時長（file: 前綴處理檔名含冒號的情況）
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$INPUT")
echo "📹 影片時長: ${DURATION}s"

# 配置参数
BUFFER_MS=50      # 刪除範圍前後各擴展 50ms（吃掉氣口）
CROSSFADE_MS=30   # 音频淡入淡出 30ms

echo "⚙️ 最佳化參數: 擴展範圍=${BUFFER_MS}ms, 音訊 crossfade=${CROSSFADE_MS}ms"

# 用 node 生成 filter_complex 命令
FILTER_CMD=$(node -e "
const fs = require('fs');
const deleteSegs = JSON.parse(fs.readFileSync('$DELETE_JSON', 'utf8'));
const duration = $DURATION;
const bufferSec = $BUFFER_MS / 1000;
const crossfadeSec = $CROSSFADE_MS / 1000;

// 按开始时间排序
deleteSegs.sort((a, b) => a.start - b.start);

// 擴展刪除範圍（前后各加 buffer）
const expandedSegs = deleteSegs.map(seg => ({
  start: Math.max(0, seg.start - bufferSec),
  end: Math.min(duration, seg.end + bufferSec)
}));

// 合併重疊的刪除段
const mergedSegs = [];
for (const seg of expandedSegs) {
  if (mergedSegs.length === 0 || seg.start > mergedSegs[mergedSegs.length - 1].end) {
    mergedSegs.push({ ...seg });
  } else {
    mergedSegs[mergedSegs.length - 1].end = Math.max(mergedSegs[mergedSegs.length - 1].end, seg.end);
  }
}

// 计算保留片段
const keepSegs = [];
let cursor = 0;

for (const del of mergedSegs) {
  if (del.start > cursor) {
    keepSegs.push({ start: cursor, end: del.start });
  }
  cursor = del.end;
}

if (cursor < duration) {
  keepSegs.push({ start: cursor, end: duration });
}

console.error('保留片段數:', keepSegs.length);
console.error('刪除片段數:', mergedSegs.length);

let deletedTime = 0;
for (const seg of mergedSegs) {
  deletedTime += seg.end - seg.start;
}
console.error('刪除總時長:', deletedTime.toFixed(2) + 's');

// 生成 filter_complex（带 crossfade）
let filters = [];
let vconcat = '';
let aLabels = [];

for (let i = 0; i < keepSegs.length; i++) {
  const seg = keepSegs[i];
  filters.push('[0:v]trim=start=' + seg.start.toFixed(3) + ':end=' + seg.end.toFixed(3) + ',setpts=PTS-STARTPTS[v' + i + ']');
  filters.push('[0:a]atrim=start=' + seg.start.toFixed(3) + ':end=' + seg.end.toFixed(3) + ',asetpts=PTS-STARTPTS[a' + i + ']');
  vconcat += '[v' + i + ']';
  aLabels.push('a' + i);
}

// 影片直接 concat
filters.push(vconcat + 'concat=n=' + keepSegs.length + ':v=1:a=0[outv]');

// 音频使用 acrossfade 逐个拼接
if (keepSegs.length === 1) {
  filters.push('[a0]anull[outa]');
} else {
  let currentLabel = 'a0';
  for (let i = 1; i < keepSegs.length; i++) {
    const nextLabel = 'a' + i;
    const outLabel = (i === keepSegs.length - 1) ? 'outa' : 'amid' + i;
    filters.push('[' + currentLabel + '][' + nextLabel + ']acrossfade=d=' + crossfadeSec.toFixed(3) + ':c1=tri:c2=tri[' + outLabel + ']');
    currentLabel = outLabel;
  }
}

console.log(filters.join(';'));
")

if [ -z "$FILTER_CMD" ]; then
  echo "❌ 產生濾鏡命令失敗"
  exit 1
fi

echo ""
echo "✂️ 執行 FFmpeg 精確剪輯..."

ffmpeg -y -i "file:$INPUT" \
  -filter_complex "$FILTER_CMD" \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a aac -b:a 192k \
  "file:$OUTPUT"

if [ $? -eq 0 ]; then
  echo "✅ 已儲存: $OUTPUT"

  NEW_DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "file:$OUTPUT")
  echo "📹 新時長: ${NEW_DURATION}s"
else
  echo "❌ 剪輯失敗"
  exit 1
fi
