import Image from "next/image";

/** The Ray's mark (from the design's logo, public/brand). A 3 KB local file, so it is sent as is. */
export function RayMark({ size = 32 }: { size?: number }) {
  return <Image src="/brand/ray-mark-64.png" alt="" width={size} height={size} unoptimized className="shrink-0 rounded-full" />;
}

/** Mark and name for the New look's sidebar. The name is text rather than part of the picture, so
 * it stays readable on the dark theme too. */
export function RayBrand() {
  return (
    <span className="flex items-center gap-2.5">
      <RayMark size={34} />
      <span className="text-lg font-extrabold tracking-[0.08em] text-foreground">THE RAY</span>
    </span>
  );
}
