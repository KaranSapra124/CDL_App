// Issued certificates. Mirrors the Go API responses.
import { apiGet } from "./api";

export type CertificateRow = {
  id: number;
  code: string;
  studentId: number;
  studentName: string;
  courseId: number;
  courseTitle: string;
  issuedAt: string;
};

export type CertificateList = {
  items: CertificateRow[];
  total: number;
  page: number;
  limit: number;
};

export function listCertificates(q: string, page: number): Promise<CertificateList> {
  const qs = new URLSearchParams({ page: String(page), limit: "15" });
  if (q.trim()) qs.set("q", q.trim());
  return apiGet<CertificateList>(`/admin/certificates?${qs.toString()}`);
}

/** Download URL for the certificate PDF. The browser sends the session cookie. */
export function certificatePdfUrl(code: string): string {
  return `/api/admin/certificates/${encodeURIComponent(code)}/pdf`;
}
