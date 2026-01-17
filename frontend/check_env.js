require('dotenv').config({ path: '.env.production' });
console.log('REACT_APP_API_BASE:', process.env.REACT_APP_API_BASE);
console.log('NODE_ENV:', process.env.NODE_ENV);
