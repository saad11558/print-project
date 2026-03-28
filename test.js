const http = require('http');

async function testApi() {
  const req = (path, method = 'GET', body = null, token = null) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (token) options.headers['Authorization'] = `Bearer ${token}`;
      
      const request = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
      });
      request.on('error', reject);
      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  };

  try {
    const signupRes = await req('/api/signup', 'POST', { name: 'Test Student', email: 'test@student.com', password: 'password', role: 'student' });
    console.log('Signup:', signupRes);
    
    // Login to get token
    const loginRes = await req('/api/login', 'POST', { email: 'test@student.com', password: 'password', role: 'student' });
    console.log('Login:', loginRes);
    const token = loginRes.body.token;

    const verifyRes = await req('/api/verify-token', 'GET', null, token);
    console.log('Verify:', verifyRes);
    
    console.log('DONE.');
  } catch (err) {
    console.error('ERROR:', err);
  }
}

testApi();
