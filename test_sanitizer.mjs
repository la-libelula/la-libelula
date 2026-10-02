import assert from 'assert';
import { sanitizeErrorMessage } from './lib/server/errorSanitizer.js';

function runTests() {
  console.log("Running Error Sanitizer Tests...");

  // 1. Bearer tokens
  const bearerErr = "Failed fetch. Authorization: Bearer eyJhbG.eyJzdWI.XXXXX-YYY";
  const bearerRes = sanitizeErrorMessage(bearerErr);
  assert.ok(bearerRes.includes('[REDACTED]'), "Bearer token should be redacted");
  assert.ok(!bearerRes.includes('eyJhbG'), "Token content should not leak");

  // 2. Telegram tokens
  const teleErr = new Error("Telegram error 401 on bot 1234567890:ABC-DEF1234567890abcdef1234567890");
  const teleRes = sanitizeErrorMessage(teleErr);
  assert.ok(teleRes.includes('[REDACTED]'), "Telegram token should be redacted");
  assert.ok(!teleRes.includes('1234567890:ABC-DEF'), "Telegram token content should not leak");

  // 3. Generic pairs
  const genericErr = "Query params api_key=superSecret123&other=4";
  const genericRes = sanitizeErrorMessage(genericErr);
  assert.ok(genericRes.includes('[REDACTED]&other=4'), "Query param should be redacted");
  assert.ok(!genericRes.includes('superSecret123'), "api_key value should not leak");

  const genericErr2 = "Response: { \"secret\": \"my_pass_123\" }";
  const genericRes2 = sanitizeErrorMessage(genericErr2);
  assert.ok(genericRes2.includes('[REDACTED]'), "JSON secret should be redacted");
  assert.ok(!genericRes2.includes('my_pass_123'), "Secret value should not leak");

  // 4. Supabase JWTs
  const supErr = "Supabase error eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const supRes = sanitizeErrorMessage(supErr);
  assert.ok(supRes.includes('[REDACTED]'), "JWT should be redacted");

  // 5. Objects / Empty
  assert.strictEqual(sanitizeErrorMessage(null), 'Unknown error during completion');
  assert.strictEqual(sanitizeErrorMessage('   '), 'Unknown error during completion');
  
  // 6. Truncation
  const longMsg = "A".repeat(600);
  const truncRes = sanitizeErrorMessage(longMsg);
  assert.strictEqual(truncRes.length, 450);
  assert.ok(truncRes.endsWith('...'));

  // 7. No Stack Trace
  const stackErr = new Error("Simple failure");
  stackErr.stack = "Error: Simple failure\n    at functionA (file.js:1:1)\n    at Object.<anonymous>";
  const stackRes = sanitizeErrorMessage(stackErr);
  assert.strictEqual(stackRes, "Simple failure");
  assert.ok(!stackRes.includes('file.js:1:1'), "Stack trace should be ignored");

  console.log("All Sanitizer Tests Passed Successfully!");
}

runTests();
