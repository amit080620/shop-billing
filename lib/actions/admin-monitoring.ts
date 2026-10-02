"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "../admin-auth";
import { sendToSentry } from "../sentry";

/** Admin → Speed: sends one test error to Sentry, so the team can see the connection works. */
export async function sendSentryTestAction(): Promise<void> {
  const admin = await requireSuperAdmin();
  await sendToSentry({
    message: "Test from Admin → Speed: The Ray is connected to Sentry",
    level: "warning",
    tags: { context: "test" },
    extra: { sentBy: admin.name },
  });
  redirect("/admin/speed?sentry=sent");
}
