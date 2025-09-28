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

/**
 * 获取北京时间的今天开始时间（北京时间0点）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间今天0点的UTC时间
 */
function getBeijingTodayStart(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的日期，然后转换回 UTC
  const beijingToday = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth(), beijingTime.getUTCDate()));
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingToday.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的今天结束时间（北京时间23:59:59）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间今天23:59:59的UTC时间
 */
function getBeijingTodayEnd(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的日期
  const beijingToday = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth(), beijingTime.getUTCDate(), 23, 59, 59, 999));
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingToday.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的本周开始时间（北京时间周一0点）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间本周一0点的UTC时间
 */
function getBeijingWeekStart(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的日期
  const beijingToday = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth(), beijingTime.getUTCDate()));
  const dayOfWeek = beijingTime.getUTCDay(); // 使用UTC方法获取星期，0=周日, 1=周一, ..., 6=周六
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 计算到周一的偏移
  const beijingMonday = new Date(beijingToday.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingMonday.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的本周结束时间（北京时间周日23:59:59）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间本周日23:59:59的UTC时间
 */
function getBeijingWeekEnd(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的日期
  const beijingToday = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth(), beijingTime.getUTCDate()));
  const dayOfWeek = beijingTime.getUTCDay(); // 使用UTC方法获取星期，0=周日, 1=周一, ..., 6=周六
  const sundayOffset = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // 计算到周日的偏移
  const beijingSunday = new Date(beijingToday.getTime() + sundayOffset * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999);
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingSunday.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的本月开始时间（北京时间1号0点）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间本月1号0点的UTC时间
 */
function getBeijingMonthStart(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的月初
  const beijingMonthStart = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth(), 1));
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingMonthStart.getTime() - 8 * 60 * 60 * 1000);
}

/**
 * 获取北京时间的本月结束时间（北京时间月末23:59:59）
 * @param {Date} date 日期对象，默认为当前时间
 * @returns {Date} 北京时间本月最后一天23:59:59的UTC时间
 */
function getBeijingMonthEnd(date = new Date()) {
  const beijingTime = toBeijingTime(date);
  // 使用 UTC 构造函数创建北京时间的下月初，然后减去1毫秒
  const beijingNextMonth = new Date(Date.UTC(beijingTime.getUTCFullYear(), beijingTime.getUTCMonth() + 1, 1));
  const beijingMonthEnd = new Date(beijingNextMonth.getTime() - 1);
  // 转换回UTC时间（减去8小时偏移）
  return new Date(beijingMonthEnd.getTime() - 8 * 60 * 60 * 1000);
}

module.exports = {
  toBeijingTime,
  formatBeijingTime,
  getBeijingYear,
  getBeijingMonth,
  getBeijingDate,
  getBeijingHour,
  getBeijingTodayStart,
  getBeijingTodayEnd,
  getBeijingWeekStart,
  getBeijingWeekEnd,
  getBeijingMonthStart,
  getBeijingMonthEnd
};
