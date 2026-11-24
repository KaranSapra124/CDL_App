// Support tickets. Mirrors the Go API responses.
import { apiGet, apiPost, apiPostForm, apiSend } from "./api";

export type TicketStatus = "open" | "in_progress" | "resolved";

export type TicketListItem = {
  id: number;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: "normal" | "urgent";
  studentId: number;
  studentName: string;
  assignedTo: string | null;
  createdAt: string;
  lastMessageAt: string;
  messages: number;
  resolvedAt: string | null;
};

export type TicketSummary = {
  open: number;
  inProgress: number;
  resolved: number;
  urgent: number;
  unassigned: number;
  avgFirstResponseMinutes: number | null;
};

export type TicketList = {
  items: TicketListItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
  summary: TicketSummary;
};

export type TicketMessage = {
  id: number;
  authorType: "admin" | "student";
  authorName: string;
  body: string;
  hasAttachment: boolean;
  attachmentType: string | null;
  createdAt: string;
};

export type Ticket = {
  id: number;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: "normal" | "urgent";
  createdAt: string;
  resolvedAt: string | null;
  assignedAdminId: number | null;
  assignedTo: string | null;
  studentId: number;
  studentName: string;
  studentEmail: string | null;
  studentMobile: string | null;
  messages: TicketMessage[];
};

export function listTickets(status: string, priority: string, q: string, page: number): Promise<TicketList> {
  const qs = new URLSearchParams({ status, priority, page: String(page) });
  if (q.trim()) qs.set("q", q.trim());
  return apiGet<TicketList>(`/admin/tickets?${qs.toString()}`);
}

export function getTicket(id: number): Promise<Ticket> {
  return apiGet<Ticket>(`/admin/tickets/${id}`);
}

/** Sends a reply. Pass a screenshot as `file` (pasted or chosen). Either text, a file, or both. */
export function replyToTicket(id: number, body: string, file: File | null): Promise<Ticket> {
  const form = new FormData();
  form.append("body", body);
  if (file) form.append("attachment", file, file.name || "screenshot.png");
  return apiPostForm<Ticket>(`/admin/tickets/${id}/messages`, form);
}

export function setTicketStatus(id: number, status: TicketStatus): Promise<Ticket> {
  return apiSend<Ticket>("PATCH", `/admin/tickets/${id}/status`, { status });
}

export function assignTicket(id: number, adminId: number): Promise<Ticket> {
  return apiPost<Ticket>(`/admin/tickets/${id}/assign`, { adminId });
}

export function attachmentUrl(ticketId: number, messageId: number): string {
  return `/api/admin/tickets/${ticketId}/messages/${messageId}/attachment`;
}
