import { request } from '../../../services/backendClient';
import { getAuthSession } from '../../../services/authSession';

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

export const coachApi = {
  listSports() {
    return request('/api/users/sports');
  },

  listCoaches() {
    return request('/api/coach');
  },

  getMyCoachApplication() {
    return request('/api/coach/me/application');
  },

  getCoach(id) {
    return request(`/api/coach/${id}`);
  },

  applyCoach({ contactEmail, hourlyRate, bio, primarySportId, certificationFile }) {
    const formData = new FormData();
    formData.append('contact_email', contactEmail);
    formData.append('hourly_rate', String(hourlyRate));
    formData.append('bio', bio || '');
    formData.append('primary_sport_id', String(primarySportId || ''));
    formData.append('certification', certificationFile);

    return request('/api/coach/apply', {
      method: 'POST',
      body: formData,
      isFormData: true
    });
  },

  requestPlan(coachId, payload) {
    return request(`/api/coach/${coachId}/requests`, {
      method: 'POST',
      body: payload
    });
  },

  listCoachRequests() {
    return request('/api/coach/requests');
  },

  listCoachPlans() {
    return request('/api/coach/plans');
  },

  createPlan(requestId, payload) {
    return request(`/api/coach/requests/${requestId}/plans`, {
      method: 'POST',
      body: payload
    });
  },

  updatePlan(requestId, payload) {
    return request(`/api/coach/requests/${requestId}/plans`, {
      method: 'PUT',
      body: payload
    });
  },

  updatePlanWithAttachments(requestId, { title, content, coachNote, attachments = [] }) {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('coach_note', coachNote || '');
    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    return request(`/api/coach/requests/${requestId}/plans`, {
      method: 'PUT',
      body: formData,
      isFormData: true
    });
  },

  createPlanWithAttachments(requestId, { title, content, coachNote, attachments = [] }) {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('coach_note', coachNote || '');
    attachments.forEach((file) => {
      formData.append('attachments', file);
    });

    return request(`/api/coach/requests/${requestId}/plans`, {
      method: 'POST',
      body: formData,
      isFormData: true
    });
  },

  listMyPlans() {
    return request('/api/plans');
  },

  async fetchPlanAttachmentBlob(planId, attachmentId, mode = 'inline') {
    const response = await fetch(`${API_BASE}/api/plans/${planId}/attachments/${attachmentId}?mode=${mode}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      let message = 'Unable to fetch attachment';
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
