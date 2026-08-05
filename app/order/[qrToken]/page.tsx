import { PublicOrderClient } from "./PublicOrderClient";

export default async function PublicOrderPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  return <PublicOrderClient qrToken={qrToken} />;
}
