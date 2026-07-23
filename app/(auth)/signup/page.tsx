import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";

export default function SignupPage() {
  return (
    <AuthShell
      title="Set up your shop"
      subtitle="Creates your shop and your owner login"
      footer={
        <>
          Already have a shop?{" "}
          <Link href="/login" className="font-semibold text-brand">
            Log in
          </Link>
        </>
      }
    >
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
    </AuthShell>
  );
}
