// 简单测试环境变量是否工作
console.log('测试环境变量：');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REACT_APP_API_BASE:', process.env.REACT_APP_API_BASE);

// 模拟API_BASE的计算逻辑
const API_BASE = process.env.REACT_APP_API_BASE || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
console.log('计算后的API_BASE:', API_BASE);
