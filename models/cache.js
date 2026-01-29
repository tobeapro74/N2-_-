'use strict';

/**
 * 캐시 매니저 클래스
 * 서버 사이드 메모리 캐싱을 위한 유틸리티
 * TTL(Time To Live) 기반 자동 만료 지원
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();

    // 캐시 통계 (디버깅/모니터링용)
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * 캐시에 데이터 저장
   * @param {string} key - 캐시 키
   * @param {any} value - 저장할 값
   * @param {number} ttlMs - 만료 시간 (밀리초), 기본 5분
   */
  set(key, value, ttlMs = 5 * 60 * 1000) {
    // 기존 타이머가 있으면 제거
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // 캐시 데이터 저장
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      ttl: ttlMs
    });

    // TTL 타이머 설정
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttlMs);

    this.timers.set(key, timer);
    this.stats.sets++;

    return true;
  }

  /**
   * 캐시에서 데이터 조회
   * @param {string} key - 캐시 키
   * @returns {any|null} - 캐시된 값 또는 null
   */
  get(key) {
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // 만료 체크 (타이머 외 추가 안전장치)
    if (Date.now() - cached.createdAt > cached.ttl) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return cached.value;
  }

  /**
   * 캐시 데이터 존재 여부 확인
   * @param {string} key - 캐시 키
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * 캐시에서 데이터 삭제
   * @param {string} key - 캐시 키
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }

    return deleted;
  }

  /**
   * 패턴에 매칭되는 모든 캐시 삭제
   * @param {string} pattern - 키 패턴 (prefix 매칭)
   */
  deleteByPattern(pattern) {
    let deletedCount = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 전체 캐시 삭제
   */
  clear() {
    // 모든 타이머 제거
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.cache.clear();

    // 통계 리셋
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * 캐시 통계 조회
   * @returns {object} - 캐시 통계 정보
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * 캐시 키 목록 조회
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 특정 키의 남은 TTL 조회
   * @param {string} key - 캐시 키
   * @returns {number|null} - 남은 시간(ms) 또는 null
   */
  getTTL(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const elapsed = Date.now() - cached.createdAt;
    const remaining = cached.ttl - elapsed;

    return remaining > 0 ? remaining : 0;
  }

  /**
   * 캐시 데이터 조회 또는 생성
   * 캐시가 없으면 factory 함수를 실행하여 데이터 생성 후 캐싱
   * @param {string} key - 캐시 키
   * @param {Function} factory - 데이터 생성 함수 (async 지원)
   * @param {number} ttlMs - 만료 시간 (밀리초)
   * @returns {Promise<any>} - 캐시된 값 또는 새로 생성된 값
   */
  async getOrSet(key, factory, ttlMs = 5 * 60 * 1000) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // factory 함수 실행 (async 함수일 수 있음)
    const value = await factory();
    this.set(key, value, ttlMs);

    return value;
  }
}

// 싱글톤 인스턴스 생성
const cacheManager = new CacheManager();

// TTL 상수 (자주 사용되는 값)
const TTL = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  TEN_MINUTES: 10 * 60 * 1000,
  THIRTY_MINUTES: 30 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000
};

module.exports = {
  cacheManager,
  CacheManager,
  TTL
};
