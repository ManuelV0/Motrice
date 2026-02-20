import { request } from './backendClient';
import { getAuthSession } from './authSession';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function authHeaders() {
  const session = getAuthSession();
  if (session.accessToken) {
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  if (session.isAuthenticated && session.userId) {
    return { 'x-dev-user-id': String(session.userId) };
  }
  return {};
}

export const adminApi = {
  listCoachApplications(status = 'pending') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/api/admin/coach-applications${query}`);
  },

  listRejectionReasons() {
    return request('/api/admin/coach-rejection-reasons');
  },

  reviewApplication(applicationId, payload) {
    return request(`/api/admin/coach-applications/${applicationId}/review`, {
      method: 'POST',
      body: payload
    });
  },

  async fetchCoachCertificationBlob(applicationId, mode = 'inline') {
    const response = await fetch(`${API_BASE}/api/admin/coach-applications/${applicationId}/certification?mode=${mode}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      let message = 'Unable to fetch certification';
      try {
        const payload = await response.json();
        message = payload.message || message;
      } catch {
        // no-op
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    return {
      blob,
      contentType: response.headers.get('content-type') || 'application/octet-stream'
    };
  }
};
