import { HttpErrorResponse } from '@angular/common/http';

const HTML_RESPONSE_MSG =
  'API returned HTML instead of JSON. Ensure the PHP backend is running and /api is proxied/routed to backend/api/index.php.';

export function extractApiError(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Cannot reach the PHP API server. Start the PHP server or check your network connection.';
    }
    const body = err.error;
    if (body && typeof body === 'object') {
      const maybeObj = body as { message?: string; error?: unknown; text?: unknown };
      if (typeof maybeObj.message === 'string' && maybeObj.message.trim() !== '') {
        return maybeObj.message;
      }
      if (
        maybeObj.error instanceof SyntaxError ||
        (typeof maybeObj.text === 'string' && maybeObj.text.trim().startsWith('<')) ||
        (typeof maybeObj.error === 'string' && maybeObj.error.includes('<!doctype'))
      ) {
        return HTML_RESPONSE_MSG;
      }
    }
    if (typeof body === 'string' && body.trim().startsWith('<')) {
      return HTML_RESPONSE_MSG;
    }
    if (err.message && (err.message.includes('not valid JSON') || err.message.includes('during parsing'))) {
      return HTML_RESPONSE_MSG;
    }
  }
  return fallback;
}
