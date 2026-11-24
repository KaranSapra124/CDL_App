// Email notifications. Mirrors the Go API responses.
import { apiGet, apiPost } from "./api";

export type NotificationAudience = "all" | "paid" | "unpaid" | "student";

export type NotificationConfig = { configured: boolean; from: string; host: string };

export type NotificationItem = {
  id: number;
  audience: string;
  recipient: string;
  subject: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type NotificationHistory = {
  items: NotificationItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
};

export function getNotificationConfig(): Promise<NotificationConfig> {
  return apiGet<NotificationConfig>("/admin/notifications/config");
}

export function listNotifications(status: string, page: number): Promise<NotificationHistory> {
  return apiGet<NotificationHistory>(`/admin/notifications?status=${status}&page=${page}`);
}

export function sendNotification(body: {
  audience: NotificationAudience;
  studentId?: number;
  subject: string;
  body: string;
}): Promise<{ queued: number; skippedNoEmail: number }> {
  return apiPost("/admin/notifications", body);
}
