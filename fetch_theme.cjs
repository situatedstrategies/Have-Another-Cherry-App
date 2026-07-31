const https = require('https');

async function run() {
  const getResponse = await new Promise((resolve) => {
    https.get('https://www.haveanothercherry.com/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        headers: res.headers,
        body: data
      }));
    });
  });

  const cookies = getResponse.headers['set-cookie'];
  const crumbMatch = getResponse.body.match(/"crumb":"([^"]+)"/);
  const crumb = crumbMatch ? crumbMatch[1] : '';

  console.log('Crumb:', crumb);
  console.log('Cookies:', cookies);

  if (!crumb) return;

  const postData = JSON.stringify({ password: "02o304o5" });
  
  const postOptions = {
    hostname: 'www.haveanothercherry.com',
    port: 443,
    path: '/api/auth/VerifyPassword',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': cookies.map(c => c.split(';')[0]).join('; '),
      'X-Csrf-Token': crumb
    }
  };

  const postResponse = await new Promise((resolve, reject) => {
    const req = https.request(postOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('POST Status:', postResponse.statusCode);
  
  const newCookies = postResponse.headers['set-cookie'];
  const allCookies = [
    ...cookies.map(c => c.split(';')[0]),
    ...(newCookies ? newCookies.map(c => c.split(';')[0]) : [])
  ].join('; ');

  const pageResponse = await new Promise((resolve) => {
    https.get('https://www.haveanothercherry.com/', {
      headers: { 'Cookie': allCookies }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
  });

  const fs = require('fs');
  fs.writeFileSync('theme.html', pageResponse);
  console.log('Saved theme.html, length:', pageResponse.length);
}
run();
