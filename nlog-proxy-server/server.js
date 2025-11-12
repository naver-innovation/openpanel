import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const PORT = process.env.PORT || 3002;
const OPENPANEL_API_URL = process.env.OPENPANEL_API_URL || 'http://localhost:3000';
const CLIENT_ID = process.env.OPENPANEL_CLIENT_ID;
const CLIENT_SECRET = process.env.OPENPANEL_CLIENT_SECRET;
const AUTO_OPEN_BROWSER = process.env.AUTO_OPEN_BROWSER !== 'false';

const fastify = Fastify({
  logger: false,
  bodyLimit: 10485760, // 10MB
});

await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST'],
});

await fastify.register(fastifyStatic, {
  root: __dirname,
  prefix: '/',
});

fastify.addHook('onRequest', async (request, reply) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    service: 'nlog-proxy-server',
    framework: 'fastify',
    timestamp: new Date().toISOString(),
    openpanel_api: OPENPANEL_API_URL,
  };
});

// Proxy endpoint - just for test...
fastify.post('/proxy', async (request, reply) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  console.log('\n=== New Request ===');
  console.log('Request ID:', requestId);
  console.log('Payload:', JSON.stringify(request.body, null, 2));
  
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('Missing OPENPANEL_CLIENT_ID or OPENPANEL_CLIENT_SECRET');
    }
    
    const openpanelUrl = `${OPENPANEL_API_URL}/track`;
    console.log('Forwarding to:', openpanelUrl);
    
    const response = await fetch(openpanelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': CLIENT_SECRET,
        'user-agent': request.headers['user-agent'] || 'nlog-proxy-server',
      },
      body: JSON.stringify(request.body),
    });
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log('OpenPanel status:', response.status);
    console.log('OpenPanel response:', responseData);
    console.log('Processing time:', processingTime, 'ms');
    console.log('=== Request Complete ===\n');
    
    reply.code(response.status).send({
      proxy_status: 'success',
      request_id: requestId,
      openpanel_status: response.status,
      openpanel_response: responseData,
      processing_time_ms: processingTime,
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('Error:', error.message);
    console.log('Processing time:', processingTime, 'ms');
    console.log('=== Request Failed ===\n');
    
    reply.code(500).send({
      proxy_status: 'error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: processingTime,
    });
  }
});

// Nlog endpoint - for future format conversion
fastify.post('/nlog', async (request, reply) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  console.log('\n=== Nlog Request ===');
  console.log('Request ID:', requestId);
  console.log('Nlog data:', JSON.stringify(request.body, null, 2));
  
  try {
    const nlogData = request.body;
    
    // TODO: Add Nlog to OpenPanel conversion logic here
    // const convertedData = convertNlogToOpenpanel(nlogData);
    
    const openpanelUrl = `${OPENPANEL_API_URL}/track`;
    
    const response = await fetch(openpanelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': CLIENT_SECRET,
      },
      body: JSON.stringify(nlogData),
    });
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log('OpenPanel response:', response.status);
    console.log('Processing time:', processingTime, 'ms');
    console.log('=== Nlog Request Complete ===\n');
    
    reply.code(response.status).send({
      proxy_status: 'success',
      request_id: requestId,
      openpanel_status: response.status,
      openpanel_response: responseData,
      processing_time_ms: processingTime,
      note: 'Nlog conversion will be added',
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('Nlog error:', error.message);
    console.log('=== Nlog Request Failed ===\n');
    
    reply.code(500).send({
      proxy_status: 'error',
      request_id: requestId,
      error: error.message,
      processing_time_ms: processingTime,
    });
  }
});

fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: `Path ${request.url} does not exist`,
    available_endpoints: [
      'GET  /health - Health check',
      'POST /proxy  - JSON proxy forwarding',
      'POST /nlog   - Nlog format conversion (in development)',
    ],
  });
});

fastify.setErrorHandler((error, request, reply) => {
  console.error('Server error:', error);
  reply.code(500).send({
    error: 'Internal Server Error',
    message: error.message,
  });
});

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' 
    : process.platform === 'win32' ? 'start' 
    : 'xdg-open';
  
  exec(`${start} ${url}`, (err) => {
    if (err) {
      console.log(`\nTip: Open browser manually at ${url}`);
    }
  });
}

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  
  console.log('\nNlog Proxy Server started (Fastify)');
  console.log('=================================');
  console.log(`Local:      http://localhost:${PORT}`);
  console.log(`OpenPanel:  ${OPENPANEL_API_URL}`);
  console.log(`Client ID:  ${CLIENT_ID ? 'Configured' : 'Not configured'}`);
  console.log(`Secret:     ${CLIENT_SECRET ? 'Configured' : 'Not configured'}`);
  console.log(`Framework:  Fastify v5`);
  console.log('=================================');
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  POST http://localhost:${PORT}/proxy`);
  console.log(`  POST http://localhost:${PORT}/nlog`);
  console.log('=================================');
  console.log('Test page:');
  console.log(`  http://localhost:${PORT}/test.html`);
  console.log('=================================\n');
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('Warning: Configure OpenPanel credentials in .env file\n');
  }

  if (AUTO_OPEN_BROWSER) {
    console.log('Opening browser...\n');
    setTimeout(() => {
      openBrowser(`http://localhost:${PORT}/test.html`);
    }, 1000);
  }
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

