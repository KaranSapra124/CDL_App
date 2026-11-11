"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiPost, type AdminUser } from "@/lib/api";
import { Field, FormError, SubmitButton } from "./form-controls";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setPending(true);
    try {
      await apiPost<AdminUser>("/admin/auth/login", { email: email.trim(), password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Access the Credit Dost Learning admin console.</p>
      </div>

      <FormError message={error} />

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="admin@creditdostlearning.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
        required
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
        required
      />

      <SubmitButton pending={pending}>Sign in</SubmitButton>

      <p className="text-center text-sm text-slate-500">
        New admin?{" "}
        <Link href="/signup" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Create an account
        </Link>
      </p>
    </form>
  );
}
