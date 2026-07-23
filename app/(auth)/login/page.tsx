import Link from "next/link";
import { loginAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your shop"
      footer={
        <>
          New shop?{" "}
          <Link href="/signup" className="font-semibold text-brand">
            Set one up
          </Link>
        </>
      }
    >
      <AuthForm
        action={loginAction}
        submitLabel="Log in"
        fields={[
          { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
          { name: "password", label: "Password", type: "password" },
        ]}
      />
    </AuthShell>
  );
}
