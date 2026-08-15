export function PageIcon({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  if (bare) {
    return <span className="flex h-9 w-9 shrink-0 items-center justify-center md:h-11 md:w-11">{children}</span>;
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm md:h-11 md:w-11 md:rounded-2xl"
      style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
    >
      {children}
    </span>
  );
}
