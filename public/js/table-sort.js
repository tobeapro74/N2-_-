/**
 * 테이블 정렬 기능
 * - 헤더 클릭으로 오름차순/내림차순 정렬
 * - 문자열, 숫자, 날짜 자동 인식
 */

class TableSort {
  constructor(table) {
    this.table = table;
    this.tbody = table.querySelector('tbody');
    this.headers = table.querySelectorAll('thead th[data-sort]');
    this.currentSort = { column: null, direction: 'asc' };

    this.init();
  }

  init() {
    this.headers.forEach((header, index) => {
      // 정렬 가능한 헤더 스타일 추가
      header.classList.add('sortable');

      // 정렬 아이콘 추가
      const icon = document.createElement('i');
      icon.className = 'bi bi-arrow-down-up sort-icon ms-1';
      header.appendChild(icon);

      // 클릭 이벤트 추가
      header.addEventListener('click', () => this.sort(index, header));
    });
  }

  sort(columnIndex, header) {
    const sortType = header.dataset.sort;
    const direction = this.currentSort.column === columnIndex && this.currentSort.direction === 'asc'
      ? 'desc'
      : 'asc';

    // 기존 정렬 상태 초기화
    this.headers.forEach(h => {
      h.classList.remove('sorted-asc', 'sorted-desc');
      const icon = h.querySelector('.sort-icon');
      if (icon) {
        icon.className = 'bi bi-arrow-down-up sort-icon ms-1';
      }
    });

    // 현재 정렬 상태 표시
    header.classList.add(`sorted-${direction}`);
    const icon = header.querySelector('.sort-icon');
    if (icon) {
      icon.className = `bi bi-arrow-${direction === 'asc' ? 'up' : 'down'} sort-icon ms-1`;
    }

    // 행 정렬
    const rows = Array.from(this.tbody.querySelectorAll('tr'));
    const sortedRows = rows.sort((a, b) => {
      const aCell = a.cells[columnIndex];
      const bCell = b.cells[columnIndex];

      if (!aCell || !bCell) return 0;

      let aValue = this.getCellValue(aCell, sortType);
      let bValue = this.getCellValue(bCell, sortType);

      let comparison = 0;

      if (sortType === 'number') {
        comparison = aValue - bValue;
      } else if (sortType === 'date') {
        comparison = aValue - bValue;
      } else {
        comparison = aValue.localeCompare(bValue, 'ko');
      }

      return direction === 'asc' ? comparison : -comparison;
    });

    // 정렬된 행 재배치
    sortedRows.forEach(row => this.tbody.appendChild(row));

    // 상태 업데이트
    this.currentSort = { column: columnIndex, direction };
  }

  getCellValue(cell, sortType) {
    // data-value 속성이 있으면 사용
    if (cell.dataset.value) {
      const val = cell.dataset.value;
      if (sortType === 'number') return parseFloat(val) || 0;
      if (sortType === 'date') return new Date(val).getTime() || 0;
      return val;
    }

    // 셀 텍스트에서 값 추출
    let text = cell.textContent.trim();

    if (sortType === 'number') {
      // 숫자 추출 (콤마, 원, + 등 제거)
      const num = text.replace(/[^\d.-]/g, '');
      return parseFloat(num) || 0;
    }

    if (sortType === 'date') {
      // 다양한 날짜 형식 처리
      // MM/DD, YYYY-MM-DD, YY-MM-DD 등
      if (text.includes('/')) {
        const [month, day] = text.split('/');
        const year = new Date().getFullYear();
        return new Date(year, parseInt(month) - 1, parseInt(day)).getTime();
      }
      return new Date(text).getTime() || 0;
    }

    return text.toLowerCase();
  }
}

// 자동 초기화 함수
function initTableSort() {
  document.querySelectorAll('table.sortable-table').forEach(table => {
    new TableSort(table);
  });
}

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initTableSort);
