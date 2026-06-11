'use client';

export function RefreshButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="bg-btnPrimary text-white rounded-[8px] h-[40px] px-[20px] text-[14px] font-[500] hover:opacity-90 transition-opacity"
    >
      Refresh
    </button>
  );
}
