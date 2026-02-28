#!/bin/bash
#
# fal.ai Wizper 语音识别（Whisper v3 Large）
#
# 用法: ./fal_transcribe.sh <audio_url>
# 输出: fal_result.json
#
# 替代原始的 volcengine_transcribe.sh
# API 文档: https://fal.ai/models/fal-ai/wizper/api
#

AUDIO_URL="$1"

if [ -z "$AUDIO_URL" ]; then
  echo "❌ 用法: ./fal_transcribe.sh <audio_url>"
  exit 1
fi

# 获取 API Key
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(dirname "$(dirname "$SCRIPT_DIR")")/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 找不到 $ENV_FILE"
  echo "请创建: cp .env.example .env 并填入 FAL_KEY"
  exit 1
fi

FAL_KEY=$(grep FAL_KEY "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$FAL_KEY" ]; then
  echo "❌ FAL_KEY 未设置"
  echo "请在 .env 中填入 FAL_KEY=your_key_here"
  exit 1
fi

echo "🎤 提交 fal.ai Wizper 转录任务..."
echo "音频 URL: $AUDIO_URL"

# 构建请求体
# chunk_level=word 获取字级别时间戳
# language=zh 中文
REQUEST_BODY=$(cat <<EOF
{
  "audio_url": "$AUDIO_URL",
  "task": "transcribe",
  "language": "zh",
  "chunk_level": "word",
  "version": "3"
}
EOF
)

# 步骤1: 提交任务到队列
echo "📤 提交到队列..."
SUBMIT_RESPONSE=$(curl -s -X POST "https://queue.fal.run/fal-ai/wizper" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

# 提取 request_id
REQUEST_ID=$(echo "$SUBMIT_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('request_id',''))" 2>/dev/null)

if [ -z "$REQUEST_ID" ]; then
  echo "❌ 提交失败，响应:"
  echo "$SUBMIT_RESPONSE"
  exit 1
fi

echo "✅ 任务已提交，ID: $REQUEST_ID"
echo "⏳ 等待转录完成..."

# 步骤2: 轮询结果
MAX_ATTEMPTS=120  # 最多等待 10 分钟
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  sleep 5
  ATTEMPT=$((ATTEMPT + 1))

  STATUS_RESPONSE=$(curl -s -X GET "https://queue.fal.run/fal-ai/wizper/requests/$REQUEST_ID/status" \
    -H "Authorization: Key $FAL_KEY")

  STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)

  if [ "$STATUS" = "COMPLETED" ]; then
    echo ""
    echo "✅ 转录完成，获取结果..."

    # 获取结果
    RESULT_RESPONSE=$(curl -s -X GET "https://queue.fal.run/fal-ai/wizper/requests/$REQUEST_ID" \
      -H "Authorization: Key $FAL_KEY")

    echo "$RESULT_RESPONSE" > fal_result.json
    echo "✅ 已保存 fal_result.json"

    # 显示统计
    CHUNK_COUNT=$(echo "$RESULT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('chunks',[])))" 2>/dev/null)
    TEXT_LEN=$(echo "$RESULT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('text','')))" 2>/dev/null)
    echo "📝 识别到 $CHUNK_COUNT 个片段，共 $TEXT_LEN 字"
    exit 0

  elif [ "$STATUS" = "IN_QUEUE" ] || [ "$STATUS" = "IN_PROGRESS" ]; then
    echo -n "."
  else
    echo ""
    echo "❌ 转录失败，状态: $STATUS"
    echo "$STATUS_RESPONSE"
    exit 1
  fi
done

echo ""
echo "❌ 超时，任务未完成"
exit 1
