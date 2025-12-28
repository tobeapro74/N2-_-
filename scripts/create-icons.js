const fs = require('fs');
const path = require('path');

// 간단한 PNG 생성 (단색 아이콘)
// 실제 프로덕션에서는 canvas 라이브러리 사용 권장

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// SVG 파일 생성 (브라우저에서 사용 가능)
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#198754"/>
      <stop offset="100%" style="stop-color:#0d6e42"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#bgGrad)"/>
  <circle cx="256" cy="200" r="80" fill="white"/>
  <circle cx="240" cy="185" r="8" fill="#ccc"/>
  <circle cx="270" cy="185" r="8" fill="#ccc"/>
  <circle cx="255" cy="210" r="8" fill="#ccc"/>
  <circle cx="230" cy="205" r="6" fill="#ddd"/>
  <circle cx="280" cy="205" r="6" fill="#ddd"/>
  <rect x="248" y="280" width="16" height="60" rx="4" fill="#f4a460"/>
  <rect x="240" y="340" width="32" height="12" rx="6" fill="#f4a460"/>
  <text x="256" y="430" font-family="Arial Black, sans-serif" font-size="100" font-weight="bold" fill="white" text-anchor="middle">N2</text>
</svg>`;

// 각 사이즈별 SVG 파일 생성
sizes.forEach(size => {
  const sizedSvg = svgContent.replace('viewBox="0 0 512 512"', `viewBox="0 0 512 512" width="${size}" height="${size}"`);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.svg`), sizedSvg);
});

// 메인 아이콘 저장
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);

// Apple touch icon (SVG 형태)
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.svg'), svgContent);

console.log('SVG 아이콘 생성 완료!');
console.log('');
console.log('PNG 아이콘이 필요한 경우:');
console.log('1. 브라우저에서 scripts/generate-icons.html 열기');
console.log('2. "아이콘 생성" 버튼 클릭');
console.log('3. 각 아이콘 다운로드하여 public/icons/ 폴더에 저장');
