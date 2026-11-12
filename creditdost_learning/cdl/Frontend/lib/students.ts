// Types and API calls for the students module. Mirrors the Go API responses.
import { apiGet, apiPost } from "./api";

export type StudentStatus = "all" | "paid" | "unpaid" | "certified";

export type StudentListItem = {
  id: number;
  name: string;
  email: string | null;
  mobile: string | null;
  city: string;
  state: string;
  preferredLanguage: string;
  registeredAt: string;
  enrollments: number;
  certificates: number;
  paidPaise: number;
  lastActivityAt: string;
  status: "paid" | "unpaid";
};

export type StudentList = {
  items: StudentListItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
  summary: { registered: number; paid: number; unpaid: number; certified: number; revenuePaise: number };
};

export type StudentListParams = {
  status: StudentStatus;
  q: string;
  course: number;
  page: number;
  limit: number;
};

export type StudentModule = {
  id: number;
  moduleNumber: number;
  title: string;
  durationSeconds: number | null;
  completed: boolean;
  watchedSeconds: number;
};

export type StudentEnrollment = {
  id: number;
  courseId: number;
  courseTitle: string;
  source: "online" | "manual";
  enrolledAt: string;
  totalModules: number;
  completedModules: number;
  certified: boolean;
  modules: StudentModule[];
};

export type StudentPayment = {
  id: number;
  code: string;
  courseTitle: string;
  basePaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  status: "pending" | "paid" | "failed" | "refunded";
  gateway: string;
  gatewayPaymentId: string | null;
  manualMethod: string | null;
  manualReference: string | null;
  createdAt: string;
};

export type StudentCertificate = {
  id: number;
  code: string;
  courseId: number;
  courseTitle: string;
  issuedAt: string;
};

export type StudentSession = {
  id: number;
  deviceLabel: string;
  ipAddress: string;
  createdAt: string;
  lastSeenAt: string;
};

export type StudentDetail = {
  profile: {
    id: number;
    name: string;
    email: string | null;
    mobile: string | null;
    city: string;
    state: string;
    preferredLanguage: string;
    registeredAt: string;
    lastActivityAt: string;
  };
  enrollments: StudentEnrollment[];
  payments: StudentPayment[];
  certificates: StudentCertificate[];
  sessions: StudentSession[];
  totalPaidPaise: number;
  completionPct: number;
  deviceLimit: number;
};

export type ManualEnrollBody = {
  name?: string;
  email?: string;
  mobile?: string;
  courseId: number;
  method: string;
  reference: string;
};

export type ManualEnrollResult = {
  studentId: number;
  orderId: number;
  createdStudent: boolean;
  course: string;
};

export function listStudents(p: StudentListParams): Promise<StudentList> {
  const qs = new URLSearchParams({ status: p.status, page: String(p.page), limit: String(p.limit) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.course > 0) qs.set("course", String(p.course));
  return apiGet<StudentList>(`/admin/students?${qs.toString()}`);
}

/** URL that downloads the current filter as CSV. The browser sends the session cookie. */
export function studentExportUrl(p: Omit<StudentListParams, "page" | "limit">): string {
  const qs = new URLSearchParams({ status: p.status });
  if (p.q.trim()) qs.set("q", p.q.trim());
  if (p.course > 0) qs.set("course", String(p.course));
  return `/api/admin/students/export?${qs.toString()}`;
}

export function getStudent(id: number): Promise<StudentDetail> {
  return apiGet<StudentDetail>(`/admin/students/${id}`);
}

export function manualEnroll(body: ManualEnrollBody): Promise<ManualEnrollResult> {
  return apiPost<ManualEnrollResult>("/admin/students/manual-enrollment", body);
}

export function issueCertificate(studentId: number, courseId: number) {
  return apiPost<StudentCertificate>(`/admin/students/${studentId}/certificates`, { courseId });
}

export function signOutEverywhere(studentId: number): Promise<{ signedOutDevices: number }> {
  return apiPost(`/admin/students/${studentId}/sessions/revoke-all`, {});
}
