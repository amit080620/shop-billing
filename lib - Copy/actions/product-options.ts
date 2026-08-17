"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export type OptionChoice = {
  id: string;
  name: string;
  extraPrice: number;
  isDefault: boolean;
};

export type OptionGroup = {
  id: string;
  name: string;
  isRequired: boolean;
  isMultiSelect: boolean;
  choices: OptionChoice[];
};

/** All option groups (with their choices) configured for one product. */
export async function listProductOptionsAction(productId: string): Promise<OptionGroup[]> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: groups } = await admin
    .from("product_option_groups")
    .select("id, name, is_required, is_multi_select")
    .eq("shop_id", session.shopId)
    .eq("product_id", productId)
    .order("sort_order");

  if (!groups || groups.length === 0) return [];

  const { data: choices } = await admin
    .from("product_option_choices")
    .select("id, group_id, name, extra_price, is_default")
    .in(
      "group_id",
      groups.map((g) => g.id),
    )
    .order("sort_order");

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    isRequired: g.is_required,
    isMultiSelect: g.is_multi_select,
    choices: (choices ?? [])
      .filter((c) => c.group_id === g.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        extraPrice: Number(c.extra_price),
        isDefault: c.is_default,
      })),
  }));
}

export async function createOptionGroupAction(
  productId: string,
  name: string,
  isRequired: boolean,
  isMultiSelect: boolean,
): Promise<{ error?: string; groupId?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter an option group name" };
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("product_option_groups")
    .insert({
      shop_id: session.shopId,
      product_id: productId,
      name: name.trim(),
      is_required: isRequired,
      is_multi_select: isMultiSelect,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not add option group" };
  revalidatePath("/products");
  return { groupId: data.id };
}

export async function deleteOptionGroupAction(groupId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("product_option_groups")
    .delete()
    .eq("id", groupId)
    .eq("shop_id", session.shopId);
  if (error) return { error: "Could not remove option group" };
  revalidatePath("/products");
  return {};
}

export async function createOptionChoiceAction(
  groupId: string,
  name: string,
  extraPrice: number,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a choice name" };
  const admin = createSupabaseAdminClient();

  // Confirm the group belongs to this shop before writing to it — the
  // choices table has no shop_id of its own, so this is what stops a
  // group id from another shop being used.
  const { data: group } = await admin
    .from("product_option_groups")
    .select("id")
    .eq("id", groupId)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!group) return { error: "Option group not found" };

  const { error } = await admin
    .from("product_option_choices")
    .insert({ group_id: groupId, name: name.trim(), extra_price: extraPrice });

  if (error) return { error: "Could not add choice" };
  revalidatePath("/products");
  return {};
}

export async function deleteOptionChoiceAction(choiceId: string, groupId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: group } = await admin
    .from("product_option_groups")
    .select("id")
    .eq("id", groupId)
    .eq("shop_id", session.shopId)
    .maybeSingle();
  if (!group) return { error: "Option group not found" };

  const { error } = await admin.from("product_option_choices").delete().eq("id", choiceId).eq("group_id", groupId);
  if (error) return { error: "Could not remove choice" };
  revalidatePath("/products");
  return {};
}
