"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { apiPost, type AdminUser } from "@/lib/api";
import { Field, FormError, SubmitButton } from "./form-controls";

const MIN_PASSWORD_LENGTH = 12;

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return "Enter your full name.";
    if (!email.trim()) return "Enter your email.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) return "Passwords do not match.";
    if (!inviteCode.trim()) return "Enter the admin invite code.";
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      await apiPost<AdminUser>("/admin/auth/signup", {
        name: name.trim(),
        email: email.trim(),
        password,
        inviteCode: inviteCode.trim(),
      });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create admin account</h1>
        <p className="mt-1 text-sm text-slate-500">Requires an invite code from a super admin.</p>
      </div>

      <FormError message={error} />

      <Field
        id="name"
        label="Full name"
        autoComplete="name"
        placeholder="Rajesh Sharma"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        required
      />

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
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
        required
      />

      <Field
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        disabled={pending}
        required
      />

      <Field
        id="inviteCode"
        label="Invite code"
        autoComplete="off"
        placeholder="Enter invite code"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        disabled={pending}
        required
      />

      <SubmitButton pending={pending}>Create account</SubmitButton>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
