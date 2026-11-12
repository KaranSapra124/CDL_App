import { Suspense } from "react";

import { StudentDetail } from "@/components/students/student-detail";

export default function StudentDetailPage() {
  // Cache Components needs a Suspense boundary around components that read route params.
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading student…</p>}>
      <StudentDetail />
    </Suspense>
  );
}
