require('dotenv').config({ path: '.env.production' });
console.log('VITE_API_BASE:', process.env.VITE_API_BASE);
console.log('NODE_ENV:', process.env.NODE_ENV);
