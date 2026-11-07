// Staff → Remove: nothing the person did is deleted — their staff row stays, so every bill, trip and
// log keeps their name — only their login stops (blocked in Supabase, refused by the app), and the
// owner can give it back. Removed people don't count to the plan's staff.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), requireOwner: vi.fn(), revalidateStaffCache: vi.fn() }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<typeof import("next/cache")>()), revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/planLimits", () => ({ staffLimitError: vi.fn(async () => null) }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOwner, revalidateStaffCache, type SessionContext } from "@/lib/auth";
import { removeStaffAction, restoreStaffAction } from "../staff";
import { ACCESS_REMOVED, ACCESS_V2, accessRemoved, canOpen } from "@/lib/staffAccess";

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const CLERK = "00000000-0000-0000-0000-0000000000b2";

function fakeAdmin(row: { name: string; role: string; permissions: string[] }) {
  const calls = { updates: [] as Record<string, unknown>[], deletes: 0, logins: [] as [string, Record<string, unknown>][] };
  const chain = { eq: () => ({ eq: async () => ({ error: null }) }) };
  const admin = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: row, error: null }),
        update: (v: Record<string, unknown>) => {
          calls.updates.push(v);
          return chain;
        },
        delete: () => {
          calls.deletes++;
          return chain;
        },
      };
      return q;
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          calls.logins.push([id, attrs]);
          return { error: null };
        },
        deleteUser: async () => {
          calls.deletes++;
          return { error: null };
        },
      },
    },
  };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue({ userId: OWNER, shopId: "shop-1", email: "owner@shop.in", role: "owner" } as SessionContext);
});

describe("removing a staff member", () => {
  it("keeps the person and their records, stops the login and refuses them in the app at once", async () => {
    const calls = fakeAdmin({ name: "Ramu", role: "staff", permissions: [ACCESS_V2, "view_reports"] });
    expect(await removeStaffAction(CLERK)).toEqual({});
    expect(calls.deletes).toBe(0);
    expect(calls.updates).toEqual([{ permissions: [ACCESS_V2, "view_reports", ACCESS_REMOVED] }]);
    expect(calls.logins).toEqual([[CLERK, { ban_duration: "876000h" }]]);
    expect(revalidateStaffCache).toHaveBeenCalledWith(CLERK);
  });

  it("a removed person opens nothing: the app refuses them on every screen (requireSession)", () => {
    expect(accessRemoved([ACCESS_V2, ACCESS_REMOVED])).toBe(true);
    expect(accessRemoved([ACCESS_V2])).toBe(false);
    expect(accessRemoved(null)).toBe(false);
    // Their other permissions are still there, ready for when the access is given back.
    expect(canOpen({ role: "staff", businessType: "grocery", permissions: [ACCESS_V2, ACCESS_REMOVED] }, "/bills/new")).toBe(true);
  });

  it("the owner can't remove themselves, and removing twice changes nothing", async () => {
    fakeAdmin({ name: "Owner", role: "owner", permissions: [] });
    expect(await removeStaffAction(OWNER)).toEqual({ error: "You can't remove yourself." });
    const calls = fakeAdmin({ name: "Ramu", role: "staff", permissions: [ACCESS_V2, ACCESS_REMOVED] });
    expect(await removeStaffAction(CLERK)).toEqual({});
    expect(calls.updates).toEqual([]);
    expect(calls.logins).toEqual([]);
  });

  it("giving the access back restores the permissions they had and unblocks the login", async () => {
    const calls = fakeAdmin({ name: "Ramu", role: "staff", permissions: [ACCESS_V2, "view_reports", ACCESS_REMOVED] });
    expect(await restoreStaffAction(CLERK)).toEqual({});
    expect(calls.updates).toEqual([{ permissions: [ACCESS_V2, "view_reports"] }]);
    expect(calls.logins).toEqual([[CLERK, { ban_duration: "none" }]]);
    expect(calls.deletes).toBe(0);
  });
});
