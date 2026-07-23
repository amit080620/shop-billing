import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Set up your shop
        </h1>
        <p className="mt-1 text-sm text-muted">
          Creates your shop and your owner login.
        </p>

        <div className="mt-6">
          <AuthForm
            action={signupAction}
            submitLabel="Create shop"
            fields={[
              { name: "shopName", label: "Shop name", type: "text", placeholder: "Sharma General Store" },
              { name: "ownerName", label: "Your name", type: "text", placeholder: "Rakesh Sharma" },
              { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
              { name: "password", label: "Password", type: "password", placeholder: "At least 6 characters" },
            ]}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have a shop?{" "}
          <Link href="/login" className="font-medium text-brand">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
