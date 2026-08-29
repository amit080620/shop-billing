/** sessionStorage key used to hand a reorder selection off from
 * /purchases/reorder to /purchases/new — a client-side pre-fill only,
 * nothing is written to the database until the purchase form itself
 * is submitted. */
export const REORDER_HANDOFF_KEY = "ray-reorder-handoff";

export type ReorderHandoff = {
  vendorId: string | null;
  items: { productId: string; description: string; hsnCode: string | null; quantity: number; unitPrice: number }[];
};
