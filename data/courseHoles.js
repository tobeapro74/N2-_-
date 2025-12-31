/**
 * 골프장 코스 홀 정보 (정적 데이터)
 * Vercel 서버리스 환경에서도 안정적으로 사용 가능
 */

module.exports = {
  yangji: {
    name: '양지파인CC',
    info: '경기도 용인시 처인구 양지면 | 27홀 (남, 동, 서)',
    courses: ['남', '동', '서'],
    holes: {
      '남': [
        { hole: 1, par: 4, distance: 360, handicap: 7, tip: '우측 OB 주의. 페어웨이 좌측을 공략하면 안전합니다. 세컨샷은 그린 앞 벙커 주의.', imageUrl: '/images/courses/yangji/nam_hole1.png' },
        { hole: 2, par: 5, distance: 520, handicap: 3, tip: '투온 가능한 홀. 우측 워터해저드 주의하며 공격적으로 공략. 롱히터는 2온 도전.', imageUrl: '/images/courses/yangji/nam_hole2.png' },
        { hole: 3, par: 3, distance: 165, handicap: 17, tip: '그린이 좌측으로 경사져 있어 핀 위치에 따라 클럽 선택 중요. 숏 아이언으로 정확하게.', imageUrl: '/images/courses/yangji/nam_hole3.png' },
        { hole: 4, par: 5, distance: 540, handicap: 1, tip: '오르막 홀. 3온 전략으로 안전하게 플레이 권장. 그린 주변 경사가 심함.', imageUrl: '/images/courses/yangji/nam_hole4.png' },
        { hole: 5, par: 3, distance: 180, handicap: 15, tip: '거리가 긴 파3. 바람의 영향을 많이 받으니 클럽 선택 신중히. 그린 앞 벙커 주의.', imageUrl: '/images/courses/yangji/nam_hole5.png' },
        { hole: 6, par: 4, distance: 380, handicap: 5, tip: '내리막 홀. 드라이버 비거리가 잘 나오니 방향성에 집중. 좌측 벙커 주의.', imageUrl: '/images/courses/yangji/nam_hole6.png' },
        { hole: 7, par: 3, distance: 155, handicap: 18, tip: '짧은 파3. 핀 위치에 따라 공략 방향 결정. 그린 경사 심함.', imageUrl: '/images/courses/yangji/nam_hole7.png' },
        { hole: 8, par: 5, distance: 515, handicap: 10, tip: '전략적 롱홀. 레이업 후 정확한 세컨샷으로 버디 찬스.', imageUrl: '/images/courses/yangji/nam_hole8.png' },
        { hole: 9, par: 4, distance: 370, handicap: 9, tip: '도그렉 좌측. 코너 공략시 세컨샷 거리 단축 가능. 우측 OB 주의.', imageUrl: '/images/courses/yangji/nam_hole9.png' }
      ],
      '동': [
        { hole: 1, par: 3, distance: 170, handicap: 16, tip: '시작홀 파3. 바람 체크 필수. 클럽 한 개 길게.', imageUrl: '/images/courses/yangji/dong_hole1.png' },
        { hole: 2, par: 4, distance: 375, handicap: 6, tip: '좌측 워터해저드 주의하며 우측 공략.', imageUrl: '/images/courses/yangji/dong_hole2.png' },
        { hole: 3, par: 4, distance: 385, handicap: 8, tip: '오르막 홀. 티샷은 페어웨이 중앙, 세컨샷은 정확한 거리 컨트롤.', imageUrl: '/images/courses/yangji/dong_hole3.png' },
        { hole: 4, par: 5, distance: 530, handicap: 2, tip: '롱홀. 2타째 레이업이 안전. 그린 앞 벙커 군락 주의.', imageUrl: '/images/courses/yangji/dong_hole4.png' },
        { hole: 5, par: 4, distance: 350, handicap: 14, tip: '내리막 도그렉. 드라이버보다 우드나 아이언으로 정확하게.', imageUrl: '/images/courses/yangji/dong_hole5.png' },
        { hole: 6, par: 5, distance: 505, handicap: 4, tip: '짧은 파5. 공격적인 플레이로 버디 찬스. 우측 OB 주의.', imageUrl: '/images/courses/yangji/dong_hole6.png' },
        { hole: 7, par: 4, distance: 395, handicap: 4, tip: '긴 파4. 티샷 방향성이 중요. 그린이 좁아 정밀한 어프로치 필요.', imageUrl: '/images/courses/yangji/dong_hole7.png' },
        { hole: 8, par: 4, distance: 340, handicap: 13, tip: '짧은 파4. 정확한 드라이버 샷 후 숏아이언으로 그린 공략.', imageUrl: '/images/courses/yangji/dong_hole8.png' },
        { hole: 9, par: 3, distance: 185, handicap: 16, tip: '긴 파3. 바람 영향 큼. 안전하게 그린 중앙 공략.', imageUrl: '/images/courses/yangji/dong_hole9.png' }
      ],
      '서': [
        { hole: 1, par: 4, distance: 355, handicap: 8, tip: '서코스 시작홀. 우측 경사면 주의. 페어웨이 좌측 공략.', imageUrl: '/images/courses/yangji/seo_hole1.png' },
        { hole: 2, par: 3, distance: 175, handicap: 14, tip: '내리막 파3. 실제 거리보다 짧게 느껴짐. 한 클럽 짧게.', imageUrl: '/images/courses/yangji/seo_hole2.png' },
        { hole: 3, par: 5, distance: 535, handicap: 6, tip: '오르막 롱홀. 3온 전략 권장. 그린 뒤 OB 주의.', imageUrl: '/images/courses/yangji/seo_hole3.png' },
        { hole: 4, par: 4, distance: 390, handicap: 2, tip: '어려운 파4. 정확한 티샷 후 롱아이언 세컨샷. 그린이 좁음.', imageUrl: '/images/courses/yangji/seo_hole4.png' },
        { hole: 5, par: 4, distance: 345, handicap: 12, tip: '짧은 파4. 드라이버보다 정확성 우선. 그린 주변 벙커 많음.', imageUrl: '/images/courses/yangji/seo_hole5.png' },
        { hole: 6, par: 4, distance: 400, handicap: 11, tip: '긴 파4. 페어웨이 우측 벙커 피해 좌측으로 티샷.', imageUrl: '/images/courses/yangji/seo_hole6.png' },
        { hole: 7, par: 4, distance: 380, handicap: 10, tip: '도그렉 우측. 티샷 방향 중요. 세컨샷 거리감 체크.', imageUrl: '/images/courses/yangji/seo_hole7.png' },
        { hole: 8, par: 3, distance: 165, handicap: 17, tip: '숏 파3. 그린 경사 확인 필수.', imageUrl: '/images/courses/yangji/seo_hole8.png' },
        { hole: 9, par: 5, distance: 505, handicap: 4, tip: '마무리 파5. 투온이 어려우니 안전하게 3온 전략.', imageUrl: '/images/courses/yangji/seo_hole9.png' }
      ]
    }
  },
  daeyoungHills: {
    name: '대영힐스CC',
    info: '충북 충주시 앙성면 | 27홀 (력, 청, 미)',
    courses: ['력', '청', '미'],
    holes: {
      '력': [
        { hole: 1, par: 4, distance: 345, handicap: 9, tip: '력코스 시작홀. 좌측 OB 주의하며 페어웨이 중앙 공략.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole1.png' },
        { hole: 2, par: 4, distance: 286, handicap: 5, tip: '짧은 파4. 정확한 샷으로 버디 찬스.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole2.png' },
        { hole: 3, par: 5, distance: 485, handicap: 17, tip: '롱홀 파5. 레이업 후 정확한 어프로치가 핵심.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole3.png' },
        { hole: 4, par: 3, distance: 155, handicap: 3, tip: '숏 파3. 그린 주변 벙커 주의.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole4.png' },
        { hole: 5, par: 4, distance: 283, handicap: 11, tip: '짧은 파4. 정확한 티샷 후 숏아이언으로 그린 공략.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole5.png' },
        { hole: 6, par: 5, distance: 405, handicap: 1, tip: '짧은 파5. 투온 도전 가능. 우측 OB 주의.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole6.png' },
        { hole: 7, par: 3, distance: 144, handicap: 15, tip: '숏 파3. 바람 체크 필수. 핀 위치에 따라 클럽 선택.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole7.png' },
        { hole: 8, par: 4, distance: 286, handicap: 7, tip: '짧은 파4. 정확한 티샷으로 버디 기회.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole8.png' },
        { hole: 9, par: 4, distance: 263, handicap: 13, tip: '마무리 홀. 짧지만 그린 앞 벙커 주의하며 확실한 피니시.', imageUrl: '/images/courses/daeyoungHills/ryuk_hole9.png' }
      ],
      '청': [
        { hole: 1, par: 5, distance: 530, handicap: 7, tip: '청코스 시작홀. 긴 파5. 레이업 후 안전하게 3온 공략.', imageUrl: '/images/courses/daeyoungHills/chung_hole1.png' },
        { hole: 2, par: 3, distance: 113, handicap: 15, tip: '짧은 파3. 핀 위치에 따라 클럽 선택. 바람 체크 필수.', imageUrl: '/images/courses/daeyoungHills/chung_hole2.png' },
        { hole: 3, par: 4, distance: 377, handicap: 3, tip: '미들 파4. 정확한 티샷 후 그린 공략.', imageUrl: '/images/courses/daeyoungHills/chung_hole3.png' },
        { hole: 4, par: 5, distance: 472, handicap: 5, tip: '짧은 파5. 투온 도전 가능. 그린 주변 벙커 주의.', imageUrl: '/images/courses/daeyoungHills/chung_hole4.png' },
        { hole: 5, par: 4, distance: 359, handicap: 13, tip: '미들 파4. 정확한 티샷이 관건.', imageUrl: '/images/courses/daeyoungHills/chung_hole5.png' },
        { hole: 6, par: 4, distance: 343, handicap: 1, tip: '짧은 파4. 버디 찬스 홀. 그린 경사 확인.', imageUrl: '/images/courses/daeyoungHills/chung_hole6.png' },
        { hole: 7, par: 3, distance: 124, handicap: 17, tip: '짧은 파3. 정확한 거리 컨트롤이 핵심.', imageUrl: '/images/courses/daeyoungHills/chung_hole7.png' },
        { hole: 8, par: 4, distance: 314, handicap: 9, tip: '짧은 파4. 정확한 샷으로 버디 기회.', imageUrl: '/images/courses/daeyoungHills/chung_hole8.png' },
        { hole: 9, par: 4, distance: 362, handicap: 11, tip: '마무리 홀. 안정적인 파 세이브로 코스 마무리.', imageUrl: '/images/courses/daeyoungHills/chung_hole9.png' }
      ],
      '미': [
        { hole: 1, par: 4, distance: 420, handicap: 10, tip: '미코스 시작홀. 긴 파4. 정확한 티샷 필수.', imageUrl: '/images/courses/daeyoungHills/mi_hole1.png' },
        { hole: 2, par: 4, distance: 363, handicap: 6, tip: '미들 파4. 페어웨이 중앙 공략.', imageUrl: '/images/courses/daeyoungHills/mi_hole2.png' },
        { hole: 3, par: 4, distance: 332, handicap: 18, tip: '짧은 파4. 버디 찬스 홀.', imageUrl: '/images/courses/daeyoungHills/mi_hole3.png' },
        { hole: 4, par: 3, distance: 155, handicap: 2, tip: '숏 파3. 그린 경사 확인 후 핀 공략.', imageUrl: '/images/courses/daeyoungHills/mi_hole4.png' },
        { hole: 5, par: 4, distance: 344, handicap: 14, tip: '미들 파4. 정확한 티샷이 관건.', imageUrl: '/images/courses/daeyoungHills/mi_hole5.png' },
        { hole: 6, par: 5, distance: 514, handicap: 4, tip: '롱홀 파5. 레이업 후 안전하게 3온.', imageUrl: '/images/courses/daeyoungHills/mi_hole6.png' },
        { hole: 7, par: 3, distance: 115, handicap: 16, tip: '가장 짧은 파3. 정확한 거리 컨트롤.', imageUrl: '/images/courses/daeyoungHills/mi_hole7.png' },
        { hole: 8, par: 5, distance: 529, handicap: 8, tip: '긴 파5. 레이업 후 정확한 어프로치.', imageUrl: '/images/courses/daeyoungHills/mi_hole8.png' },
        { hole: 9, par: 4, distance: 453, handicap: 12, tip: '마무리 홀. 긴 파4. 안정적인 파 세이브로 마무리.', imageUrl: '/images/courses/daeyoungHills/mi_hole9.png' }
      ]
    }
  },
  daeyoungBase: {
    name: '대영베이스CC',
    info: '충북 충주시 앙성면 | 18홀 (인, 아웃)',
    courses: ['인', '아웃'],
    holes: {
      '인': [
        { hole: 1, par: 4, distance: 354, handicap: 8, tip: '인코스 시작홀. 미들 파4. 정확한 티샷으로 버디 찬스.', imageUrl: '/images/courses/daeyoungBase/in_hole1.png' },
        { hole: 2, par: 5, distance: 467, handicap: 16, tip: '짧은 파5. 투온 도전 가능. 그린 주변 벙커 주의.', imageUrl: '/images/courses/daeyoungBase/in_hole2.png' },
        { hole: 3, par: 3, distance: 150, handicap: 4, tip: '숏 파3. 바람 체크 후 클럽 선택.', imageUrl: '/images/courses/daeyoungBase/in_hole3.png' },
        { hole: 4, par: 4, distance: 367, handicap: 2, tip: '미들 파4. 정확한 티샷이 관건.', imageUrl: '/images/courses/daeyoungBase/in_hole4.png' },
        { hole: 5, par: 4, distance: 322, handicap: 14, tip: '짧은 파4. 버디 찬스 홀.', imageUrl: '/images/courses/daeyoungBase/in_hole5.png' },
        { hole: 6, par: 5, distance: 480, handicap: 10, tip: '미들 파5. 레이업 후 정확한 어프로치.', imageUrl: '/images/courses/daeyoungBase/in_hole6.png' },
        { hole: 7, par: 3, distance: 168, handicap: 12, tip: '미들 파3. 그린 경사 확인.', imageUrl: '/images/courses/daeyoungBase/in_hole7.png' },
        { hole: 8, par: 4, distance: 385, handicap: 6, tip: '긴 파4. 정확한 티샷 필수.', imageUrl: '/images/courses/daeyoungBase/in_hole8.png' },
        { hole: 9, par: 4, distance: 340, handicap: 18, tip: '마무리 홀. 안정적인 파 세이브.', imageUrl: '/images/courses/daeyoungBase/in_hole9.png' }
      ],
      '아웃': [
        { hole: 1, par: 4, distance: 362, handicap: 7, tip: '아웃코스 시작홀. 미들 파4. 페어웨이 중앙 공략.', imageUrl: '/images/courses/daeyoungBase/out_hole1.png' },
        { hole: 2, par: 3, distance: 142, handicap: 15, tip: '짧은 파3. 핀 위치에 따라 클럽 선택.', imageUrl: '/images/courses/daeyoungBase/out_hole2.png' },
        { hole: 3, par: 5, distance: 495, handicap: 3, tip: '미들 파5. 레이업 후 안전하게 3온.', imageUrl: '/images/courses/daeyoungBase/out_hole3.png' },
        { hole: 4, par: 4, distance: 376, handicap: 1, tip: '어려운 파4. 정확한 티샷과 세컨샷 필수.', imageUrl: '/images/courses/daeyoungBase/out_hole4.png' },
        { hole: 5, par: 4, distance: 335, handicap: 11, tip: '미들 파4. 버디 찬스 홀.', imageUrl: '/images/courses/daeyoungBase/out_hole5.png' },
        { hole: 6, par: 3, distance: 158, handicap: 17, tip: '숏 파3. 바람 체크 필수.', imageUrl: '/images/courses/daeyoungBase/out_hole6.png' },
        { hole: 7, par: 5, distance: 512, handicap: 5, tip: '긴 파5. 레이업 후 정확한 어프로치.', imageUrl: '/images/courses/daeyoungBase/out_hole7.png' },
        { hole: 8, par: 4, distance: 348, handicap: 9, tip: '미들 파4. 정확한 티샷이 관건.', imageUrl: '/images/courses/daeyoungBase/out_hole8.png' },
        { hole: 9, par: 4, distance: 395, handicap: 13, tip: '마무리 홀. 긴 파4. 안정적인 파 세이브로 마무리.', imageUrl: '/images/courses/daeyoungBase/out_hole9.png' }
      ]
    }
  }
};
