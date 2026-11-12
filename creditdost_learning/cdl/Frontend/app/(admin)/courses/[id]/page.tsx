import { Suspense } from "react";

import { CourseEditor } from "@/components/courses/course-editor";

export default function CourseEditorPage() {
  // Cache Components needs a Suspense boundary around components that read route params.
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading course…</p>}>
      <CourseEditor />
    </Suspense>
  );
}
