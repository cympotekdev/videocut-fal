#!/usr/bin/env node
/**
 * 審核伺服器
 *
 * 功能：
 * 1. 提供静态文件服务（review.html, audio.mp3）
 * 2. POST /api/cut - 接收刪除清單，執行剪輯
 *
 * 用法: node review_server.js [port] [video_file]
 * 預設: port=8899, video_file=自動偵測目錄下的 .mp4
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.argv[2] || 8899;
let VIDEO_FILE = process.argv[3] || findVideoFile();

function findVideoFile() {
  const files = fs.readdirSync('.').filter(f => f.endsWith('.mp4'));
  return files[0] || 'source.mp4';
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: 執行剪輯
  if (req.method === 'POST' && req.url === '/api/cut') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const deleteList = JSON.parse(body);

        // 儲存刪除清單到目前目錄
        fs.writeFileSync('delete_segments.json', JSON.stringify(deleteList, null, 2));
        console.log(`📝 儲存 ${deleteList.length} 个刪除片段`);

        // 產生輸出檔名
        const baseName = path.basename(VIDEO_FILE, '.mp4');
        const outputFile = `${baseName}_cut.mp4`;

        // 執行剪輯
        const scriptPath = path.join(__dirname, 'cut_video.sh');

        if (!fs.existsSync(scriptPath)) {
          // 如果没有 cut_video.sh，用内置的 ffmpeg 命令
          console.log('🎬 執行剪輯...');
          executeFFmpegCut(VIDEO_FILE, deleteList, outputFile);
        } else {
          console.log('🎬 呼叫 cut_video.sh...');
          execSync(`bash "${scriptPath}" "${VIDEO_FILE}" delete_segments.json "${outputFile}"`, {
            stdio: 'inherit'
          });
        }

        // 取得剪輯前後的時長資訊
        const originalDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${VIDEO_FILE}"`).toString().trim());
        const newDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${outputFile}"`).toString().trim());
        const deletedDuration = originalDuration - newDuration;
        const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          output: outputFile,
          originalDuration: originalDuration.toFixed(2),
          newDuration: newDuration.toFixed(2),
          deletedDuration: deletedDuration.toFixed(2),
          savedPercent: savedPercent,
          message: `剪輯完成: ${outputFile}`
        }));

      } catch (err) {
        console.error('❌ 剪輯失敗:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 静态文件服务（从当前目录读取）
  let filePath = req.url === '/' ? '/review.html' : req.url;
  filePath = '.' + filePath;

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const stat = fs.statSync(filePath);

  // 支持 Range 请求（音频/影片拖动）
  if (req.headers.range && (ext === '.mp3' || ext === '.mp4')) {
    const range = req.headers.range.replace('bytes=', '').split('-');
    const start = parseInt(range[0], 10);
    const end = range[1] ? parseInt(range[1], 10) : stat.size - 1;

    res.writeHead(206, {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  // 普通请求
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes'
  });
  fs.createReadStream(filePath).pipe(res);
});

// 偵測可用的硬體編碼器
function detectEncoder() {
  const platform = process.platform;
  const encoders = [];

  // 依平台判斷候選編碼器
  if (platform === 'darwin') {
    encoders.push({ name: 'h264_videotoolbox', args: '-q:v 60', label: 'VideoToolbox (macOS)' });
  } else if (platform === 'win32') {
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_qsv', args: '-global_quality 20', label: 'QSV (Intel)' });
    encoders.push({ name: 'h264_amf', args: '-quality balanced', label: 'AMF (AMD)' });
  } else {
    // Linux
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_vaapi', args: '-qp 20', label: 'VAAPI (Linux)' });
  }

  // 軟體編碼兜底
  encoders.push({ name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' });

  // 偵測哪個可用
  for (const enc of encoders) {
    try {
      execSync(`ffmpeg -hide_banner -encoders 2>/dev/null | grep ${enc.name}`, { stdio: 'pipe' });
      console.log(`🎯 偵測到編碼器: ${enc.label}`);
      return enc;
    } catch (e) {
      // 此編碼器不可用，繼續偵測下一個
    }
  }

  // 預設回傳軟體編碼
  return { name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (软件)' };
}

// 快取編碼器偵測結果
let cachedEncoder = null;
function getEncoder() {
  if (!cachedEncoder) {
    cachedEncoder = detectEncoder();
  }
  return cachedEncoder;
}

// 内置 FFmpeg 剪辑逻辑（filter_complex 精确剪辑 + buffer + crossfade）
function executeFFmpegCut(input, deleteList, output) {
  // 設定參數
  const BUFFER_MS = 50;     // 刪除範圍前後各擴展 50ms（吃掉氣口和殘音）
  const CROSSFADE_MS = 30;  // 音频淡入淡出 30ms

  console.log(`⚙️ 最佳化參數: 擴展範圍=${BUFFER_MS}ms, 音訊 crossfade=${CROSSFADE_MS}ms`);

  // 偵測音訊偏移量（audio.mp3 的 start_time）
  let audioOffset = 0;
  try {
    const offsetCmd = `ffprobe -v error -show_entries format=start_time -of csv=p=0 audio.mp3`;
    audioOffset = parseFloat(execSync(offsetCmd).toString().trim()) || 0;
    if (audioOffset > 0) {
      console.log(`🔧 偵測到音訊偏移: ${audioOffset.toFixed(3)}s，自动补偿`);
    }
  } catch (e) {
    // 忽略，使用預設 0
  }

  // 取得影片總時長
  const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${input}"`;
  const duration = parseFloat(execSync(probeCmd).toString().trim());

  const bufferSec = BUFFER_MS / 1000;
  const crossfadeSec = CROSSFADE_MS / 1000;

  // 補償偏移 + 擴展刪除範圍（前后各加 buffer）
  const expandedDelete = deleteList
    .map(seg => ({
      start: Math.max(0, seg.start - audioOffset - bufferSec),
      end: Math.min(duration, seg.end - audioOffset + bufferSec)
    }))
    .sort((a, b) => a.start - b.start);

  // 合併重疊的刪除段
  const mergedDelete = [];
  for (const seg of expandedDelete) {
    if (mergedDelete.length === 0 || seg.start > mergedDelete[mergedDelete.length - 1].end) {
      mergedDelete.push({ ...seg });
    } else {
      mergedDelete[mergedDelete.length - 1].end = Math.max(mergedDelete[mergedDelete.length - 1].end, seg.end);
    }
  }

  // 計算保留片段
  const keepSegments = [];
  let cursor = 0;

  for (const del of mergedDelete) {
    if (del.start > cursor) {
      keepSegments.push({ start: cursor, end: del.start });
    }
    cursor = del.end;
  }
  if (cursor < duration) {
    keepSegments.push({ start: cursor, end: duration });
  }

  console.log(`保留 ${keepSegments.length} 個片段，刪除 ${mergedDelete.length} 個片段`);

  // 產生 filter_complex（带 crossfade）
  let filters = [];
  let vconcat = '';

  for (let i = 0; i < keepSegments.length; i++) {
    const seg = keepSegments[i];
    filters.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vconcat += `[v${i}]`;
  }

  // 影片直接 concat
  filters.push(`${vconcat}concat=n=${keepSegments.length}:v=1:a=0[outv]`);

  // 音訊使用 acrossfade 逐一拼接（消除接縫咔声）
  if (keepSegments.length === 1) {
    filters.push(`[a0]anull[outa]`);
  } else {
    let currentLabel = 'a0';
    for (let i = 1; i < keepSegments.length; i++) {
      const nextLabel = `a${i}`;
      const outLabel = (i === keepSegments.length - 1) ? 'outa' : `amid${i}`;
      filters.push(`[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`);
      currentLabel = outLabel;
    }
  }

  const filterComplex = filters.join(';');

  const encoder = getEncoder();
  console.log(`✂️ 執行 FFmpeg 精確剪輯（${encoder.label}）...`);

  const cmd = `ffmpeg -y -i "file:${input}" -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 192k "file:${output}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`✅ 輸出: ${output}`);

    const newDuration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${output}"`).toString().trim());
    console.log(`📹 新時長: ${newDuration.toFixed(2)}s`);
  } catch (err) {
    console.error('FFmpeg 執行失敗，嘗試分段方案...');
    executeFFmpegCutFallback(input, keepSegments, output);
  }
}

// 备用方案：分段切割 + concat（当 filter_complex 失败时使用）
function executeFFmpegCutFallback(input, keepSegments, output) {
  const tmpDir = `tmp_cut_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const partFiles = [];
    keepSegments.forEach((seg, i) => {
      const partFile = path.join(tmpDir, `part${i.toString().padStart(4, '0')}.mp4`);
      const segDuration = seg.end - seg.start;

      const encoder = getEncoder();
      const cmd = `ffmpeg -y -ss ${seg.start.toFixed(3)} -i "file:${input}" -t ${segDuration.toFixed(3)} -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 128k -avoid_negative_ts make_zero "${partFile}"`;

      console.log(`切割片段 ${i + 1}/${keepSegments.length}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s`);
      execSync(cmd, { stdio: 'pipe' });
      partFiles.push(partFile);
    });

    const listFile = path.join(tmpDir, 'list.txt');
    const listContent = partFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`;
    console.log('合併片段...');
    execSync(concatCmd, { stdio: 'pipe' });

    console.log(`✅ 輸出: ${output}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

server.listen(PORT, () => {
  console.log(`
🎬 審核伺服器已啟動
📍 位址: http://localhost:${PORT}
📹 影片: ${VIDEO_FILE}

操作說明:
1. 在網頁中審核要刪除的片段
2. 點選「🎬 執行剪輯」按鈕
3. 等待剪輯完成
  `);
});
