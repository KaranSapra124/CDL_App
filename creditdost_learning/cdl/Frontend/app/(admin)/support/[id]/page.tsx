import { Suspense } from "react";

import { TicketThread } from "@/components/support/ticket-thread";

export default function TicketPage() {
  // Cache Components needs a Suspense boundary around components that read route params.
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading ticket…</p>}>
      <TicketThread />
    </Suspense>
  );
}
