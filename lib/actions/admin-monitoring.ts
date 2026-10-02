"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "../admin-auth";
import { sendToSentry } from "../sentry";

/** Admin → Speed: sends one test error to Sentry and shows whether Sentry accepted it. */
export async function sendSentryTestAction(): Promise<void> {
  const admin = await requireSuperAdmin();
  const accepted = await sendToSentry({
    message: "Test from Admin → Speed: The Ray is connected to Sentry",
    level: "warning",
    tags: { context: "test" },
    extra: { sentBy: admin.name },
  });
  redirect(`/admin/speed?sentry=${accepted ? "accepted" : "refused"}`);
}
