import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">Log in</h1>
        <p className="mt-1 text-sm text-muted">Welcome back.</p>

        <div className="mt-6">
          <AuthForm
            action={loginAction}
            submitLabel="Log in"
            fields={[
              { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
              { name: "password", label: "Password", type: "password" },
            ]}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          New shop?{" "}
          <Link href="/signup" className="font-medium text-brand">
            Set one up
          </Link>
        </p>
      </div>
    </div>
  );
}
