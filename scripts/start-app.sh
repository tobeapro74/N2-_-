#!/bin/bash

# N2골프 자금관리 시스템 실행 스크립트
# 서버 시작 후 브라우저에서 자동으로 열기

APP_DIR="/Users/byungchulpark/N2골프_자금관리"
PORT=9876
URL="http://localhost:$PORT"

cd "$APP_DIR"

# 기존 서버가 실행 중인지 확인
if lsof -i :$PORT > /dev/null 2>&1; then
    echo "서버가 이미 실행 중입니다. 브라우저를 열겠습니다."
    open "$URL"
    exit 0
fi

# Node.js 서버 시작 (백그라운드)
echo "N2골프 자금관리 시스템을 시작합니다..."
npm start &

# 서버가 시작될 때까지 대기 (최대 10초)
for i in {1..20}; do
    if curl -s "$URL" > /dev/null 2>&1; then
        echo "서버가 시작되었습니다!"
        open "$URL"
        exit 0
    fi
    sleep 0.5
done

echo "서버 시작에 실패했습니다."
exit 1
