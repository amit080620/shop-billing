export function PageIcon({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  if (bare) {
    return <span className="flex h-8 w-8 shrink-0 items-center justify-center md:h-10 md:w-10">{children}</span>;
  }
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm md:h-10 md:w-10 md:rounded-2xl"
      style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
    >
      {children}
    </span>
  );
}
