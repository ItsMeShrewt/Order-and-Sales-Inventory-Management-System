import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
  // Set max body length and content length to support up to 30MB uploads
  // This ensures axios doesn't limit file uploads (default is 10MB)
  maxBodyLength: 30 * 1024 * 1024, // 30MB
  maxContentLength: 30 * 1024 * 1024, // 30MB
});

// Add request interceptor to disable caching
api.interceptors.request.use((config) => {
  config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  config.headers['Pragma'] = 'no-cache';
  config.headers['Expires'] = '0';
  return config;
});

export default api;

// Usage examples:
// import api from 'src/lib/axios';
// api.get('/users').then(res => console.log(res.data));
// api.post('/login', { email, password }).then(res => console.log(res.data));
