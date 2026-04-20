/**
 * Vercel 등 UTC 서버에서도 한국(Asia/Seoul) 기준 날짜·월을 사용하기 위한 유틸
 */

/**
 * @returns {string} YYYY-MM
 */
function getSeoulYearMonth() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7);
}

/**
 * @returns {string} YYYY-MM-DD
 */
function getSeoulDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

module.exports = {
  getSeoulYearMonth,
  getSeoulDateString
};
