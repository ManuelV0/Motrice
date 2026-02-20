import { getAuthSession } from './authSession';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson ? payload.message || 'Request failed' : payload || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function request(path, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
  const session = getAuthSession();
  const finalHeaders = { ...headers };

  if (session.accessToken) {
    finalHeaders.Authorization = `Bearer ${session.accessToken}`;
  } else if (session.isAuthenticated && session.userId) {
    finalHeaders['x-dev-user-id'] = String(session.userId);
  }

  let finalBody = body;
  if (!isFormData && body && typeof body === 'object') {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: method === 'GET' ? undefined : finalBody
  });

  return parseResponse(response);
}
