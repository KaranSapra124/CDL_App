import { ManualEnrollForm } from "@/components/students/manual-enroll-form";

export default function ManualEnrollPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Students</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Manual enrolment</h1>
      </div>
      <ManualEnrollForm />
    </div>
  );
}
