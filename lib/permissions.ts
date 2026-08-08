export const PERMISSIONS = [
  { key: "view_reports", label: "View reports", description: "Sales reports, GST reports, daily summary" },
  { key: "manage_products", label: "Manage items", description: "Add, edit, or delete products/items" },
  { key: "manage_customers", label: "Manage customers", description: "Add and edit customer records" },
  { key: "process_returns", label: "Process returns", description: "Create returns and refunds against a bill" },
  { key: "void_bills", label: "Void bills", description: "Cancel/void an already-created bill" },
  { key: "edit_bills", label: "Edit bills", description: "Correct quantities on a bill already created" },
  { key: "manage_staff", label: "Manage staff", description: "Add, edit, or remove staff accounts" },
  { key: "manage_settings", label: "Shop settings", description: "GST profile, invoice design, subscription" },
  { key: "manage_expenses", label: "Petty cash", description: "Log day-to-day cash expenses" },
  { key: "give_discounts", label: "Give discounts", description: "Apply a discount when billing" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
