export function PageIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm md:h-11 md:w-11 md:rounded-2xl"
      style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
    >
      {children}
    </span>
  );
}
