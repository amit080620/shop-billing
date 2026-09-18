export function PageIcon({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  if (bare) {
    return <span className="flex h-9 w-9 shrink-0 items-center justify-center md:h-10 md:w-10">{children}</span>;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-text md:h-10 md:w-10 [&>svg]:h-[18px] [&>svg]:w-[18px] md:[&>svg]:h-5 md:[&>svg]:w-5">
      {children}
    </span>
  );
}
