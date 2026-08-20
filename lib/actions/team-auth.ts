"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";

export type ActionState = { error?: string } | null;

export async function teamLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Enter your email and password" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Incorrect email or password" };
  }

  const admin = createSupabaseAdminClient();
  const { data: viewer } = await admin
    .from("team_viewers")
    .select("user_id")
    .eq("user_id", data.user.id)
    .single();

  if (!viewer) {
    // Valid login, but not whitelisted for this panel — don't leave an
    // authenticated session sitting around for an account that isn't
    // genuinely a team viewer (it might even be a super admin's own
    // login, which still shouldn't get in through this door).
    await supabase.auth.signOut();
    return { error: "This account doesn't have access to the Leads Dashboard." };
  }

  redirect("/team");
}

export async function teamLogoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/team/login");
}

/** Used by the (panel) layout to confirm the current session is
 * genuinely a whitelisted team viewer before rendering anything —
 * redirects to login otherwise. This is the ONLY gate; there is no
 * other route into /team's data. */
export async function requireTeamViewer() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/team/login");

  const admin = createSupabaseAdminClient();
  const { data: viewer } = await admin
    .from("team_viewers")
    .select("name")
    .eq("user_id", userData.user!.id)
    .single();
  if (!viewer) redirect("/team/login");

  return { name: viewer.name };
}
