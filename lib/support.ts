// Support requests (SR-…) are rows of sales_enquiries (kind "custom") whose item starts with
// "[Support/<category>]" — see lib/actions/support.ts. These read them the same way everywhere.

export const SUPPORT_PREFIX = "[Support/";

export const srNumber = (id: string) => `SR-${id.slice(0, 8).toUpperCase()}`;

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing / payment",
  technical: "Something's not working",
  feature: "Feature request",
  other: "Something else",
};

export function supportParts(item: string): { category: string; message: string } {
  const m = item.match(/^\[Support\/(\w+)\]\s*([\s\S]*)$/);
  if (!m) return { category: "Support", message: item };
  return { category: CATEGORY_LABEL[m[1]] ?? m[1], message: m[2] };
}

/** What the shop sees for each status of its request. */
export const SUPPORT_STATUS: Record<string, string> = {
  new: "Received",
  contacted: "Being worked on",
  won: "Resolved",
  lost: "Closed",
};
