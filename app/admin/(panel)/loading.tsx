/** Shown the moment an admin tab is tapped, until its data arrives. */
export default function AdminLoading() {
  return (
    <div data-loading-screen className="flex animate-pulse flex-col gap-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 rounded bg-gray-800" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-16 rounded-xl bg-gray-900" />
        <div className="h-16 rounded-xl bg-gray-900" />
        <div className="h-16 rounded-xl bg-gray-900" />
      </div>
      <div className="h-14 rounded-xl bg-gray-900" />
      <div className="h-14 rounded-xl bg-gray-900" />
      <div className="h-14 rounded-xl bg-gray-900" />
    </div>
  );
}
