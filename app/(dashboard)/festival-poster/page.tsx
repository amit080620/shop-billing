import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { PartyPopper } from "lucide-react";
import { PosterClient } from "./PosterClient";

export default async function FestivalPosterPage({ searchParams }: { searchParams: Promise<{ occasion?: string }> }) {
  const session = await requireSession();
  const { occasion } = await searchParams;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<PartyPopper size={18} strokeWidth={1.8} />} title="Festival poster" subtitle="AI writes the offer, you get a ready-to-share design — free" />
      <PosterClient shopName={session.shopName} initialOccasion={occasion} />
    </div>
  );
}
