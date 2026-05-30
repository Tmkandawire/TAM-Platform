/**
 * @file contact.service.js
 * Frontend service for the admin contact inbox.
 */

import apiClient from "./api.js";

export const CONTACT_QUERY_KEYS = {
  all: ["contact-messages"],
  list: (filters) => ["contact-messages", "list", filters],
  detail: (id) => ["contact-messages", "detail", id],
  unreadCount: ["contact-messages", "unread-count"],
};

const contactService = {
  getMessages: async ({ status, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set("status", status);
    const { data } = await apiClient.get(`/admin/contact?${params}`);
    return data;
  },

  getMessage: async (id) => {
    const { data } = await apiClient.get(`/admin/contact/${id}`);
    return data;
  },

  archiveMessage: async (id) => {
    const { data } = await apiClient.patch(`/admin/contact/${id}/archive`);
    return data;
  },

  deleteMessage: async (id) => {
    const { data } = await apiClient.delete(`/admin/contact/${id}`);
    return data;
  },

  replyToMessage: async (id, replyMessage) => {
    const { data } = await apiClient.post(`/admin/contact/${id}/reply`, {
      replyMessage,
    });
    return data;
  },

  getUnreadCount: async () => {
    const { data } = await apiClient.get("/admin/contact/unread-count");
    return data;
  },
};

export default contactService;
