// 时区处理工具函数

/**
 * 将UTC时间转换为北京时间
 * @param {Date} utcDate UTC时间
 * @returns {Date} 北京时间
 */
function toBeijingTime(utcDate) {
  return new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的格式化字符串
 * @param {Date} date 日期对象
 * @param {string} format 格式类型
 * @returns {string} 格式化后的时间字符串
 */
function formatBeijingTime(date, format = 'time') {
  const beijingTime = toBeijingTime(date);
  
  switch (format) {
    case 'time':
      return beijingTime.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit'
      });
    case 'datetime':
      return beijingTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'date':
      return beijingTime.toLocaleDateString('zh-CN');
    default:
      return beijingTime.toLocaleString('zh-CN');
  }
}

/**
 * 获取北京时间的年份
 * @param {Date} date 日期对象
 * @returns {number} 年份
 */
function getBeijingYear(date) {
  return toBeijingTime(date).getUTCFullYear();
}

/**
 * 获取北京时间的月份
 * @param {Date} date 日期对象
 * @returns {number} 月份 (0-11)
 */
function getBeijingMonth(date) {
  return toBeijingTime(date).getUTCMonth();
}

/**
 * 获取北京时间的日期
 * @param {Date} date 日期对象
 * @returns {number} 日期
 */
function getBeijingDate(date) {
  return toBeijingTime(date).getUTCDate();
}

/**
 * 获取北京时间的小时
 * @param {Date} date 日期对象
 * @returns {number} 小时 (0-23)
 */
function getBeijingHour(date) {
  return toBeijingTime(date).getUTCHours();
}

module.exports = {
  toBeijingTime,
  formatBeijingTime,
  getBeijingYear,
  getBeijingMonth,
  getBeijingDate,
  getBeijingHour
};
