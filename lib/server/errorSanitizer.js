export function sanitizeErrorMessage(err) {
  if (err === null || err === undefined) {
    return 'Unknown error during completion';
  }

  let msg = '';
  if (err instanceof Error) {
    msg = err.message || err.toString();
  } else if (typeof err === 'object') {
    try {
      msg = JSON.stringify(err);
    } catch (e) {
      msg = 'Unserializable error object';
    }
  } else {
    msg = String(err);
  }

  const patterns = [
    // Bearer / Authorization headers
    /(?:bearer|authorization)\s*[:=]\s*["']?[a-zA-Z0-9\-_=.]+["']?/gi,
    
    // Telegram bot tokens
    /\b\d{8,12}:[A-Za-z0-9_-]{30,40}\b/g,
    
    // Supabase service keys / sb_secret_ / JWTs
    /\b(sb_secret_[a-zA-Z0-9_\-]+)\b/gi,
    /\b(ey[a-zA-Z0-9_-]+\.ey[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
    
    // Generic key=value or "key": "value"
    /(?:["']?(?:api_key|apikey|token|password|secret|pass|key)["']?)\s*[:=]\s*["']?[^"'\s,&;]+["']?/gi
  ];

  for (const pattern of patterns) {
    msg = msg.replace(pattern, '[REDACTED]');
  }

  msg = msg.trim();
  
  if (!msg) {
    return 'Unknown error during completion';
  }

  if (msg.length > 450) {
    msg = msg.substring(0, 447) + '...';
  }

  return msg;
}
