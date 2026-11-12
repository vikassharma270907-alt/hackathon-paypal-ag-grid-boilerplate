import fs from 'fs';
import path from 'path';

// Load .env.local and .env into process.env for test runs if not already set
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(envLocalPath);
loadEnvFile(envPath);

// Provide default test credentials for CI and test environments where placeholder credentials exist
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key') {
  process.env.GEMINI_API_KEY = 'AIzaSyTestKeyForContinuousIntegration12345';
}
if (!process.env.CHANNEL3_API_KEY || process.env.CHANNEL3_API_KEY === 'your_channel3_api_key') {
  process.env.CHANNEL3_API_KEY = 'c3_test_key_continuous_integration';
}
if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'your_sandbox_client_id') {
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
}
if (!process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET === 'your_sandbox_client_secret') {
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
}
if (!process.env.PAYPAL_SECRET || process.env.PAYPAL_SECRET === 'your_sandbox_client_secret') {
  process.env.PAYPAL_SECRET = 'test-client-secret';
}


