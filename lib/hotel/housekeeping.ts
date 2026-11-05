// A room's housekeeping stage, and what follows it. Pure, used on the screens and the server.
export const HK_STAGES = ["dirty", "cleaning", "clean", "inspected"] as const;
export type HkStage = (typeof HK_STAGES)[number];

export const HK_LABEL: Record<HkStage, string> = { dirty: "Needs cleaning", cleaning: "Being cleaned", clean: "Clean", inspected: "Inspected" };

/** The rest of the app asks only whether a room is ready to sell. */
export const hkReady = (stage: string) => stage === "clean" || stage === "inspected";
export const hkNormal = (stage: string): "clean" | "dirty" => (hkReady(stage) ? "clean" : "dirty");

/** The next steps from a stage; a room can always be marked dirty again. */
export function hkNext(stage: string): HkStage[] {
  if (stage === "dirty") return ["cleaning", "clean"];
  if (stage === "cleaning") return ["clean"];
  if (stage === "clean") return ["inspected", "dirty"];
  return ["dirty"];
}

export const TICKET_CATEGORIES = ["ac", "plumbing", "electrical", "furniture", "tv_wifi", "cleaning", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = { ac: "AC", plumbing: "Plumbing", electrical: "Electrical", furniture: "Furniture", tv_wifi: "TV / Wi-Fi", cleaning: "Deep cleaning", other: "Other" };
export const TICKET_PRIORITIES = ["low", "normal", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = { low: "Low", normal: "Normal", urgent: "Urgent" };
