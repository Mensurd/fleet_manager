import { STATUS_STYLE, STATUS_LABEL } from "@/lib/api";

export default function StatusBadge({ status, testId }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.none}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "expired"
            ? "bg-red-400"
            : status === "expiring"
            ? "bg-amber-400"
            : status === "valid"
            ? "bg-emerald-400"
            : "bg-slate-500"
        }`}
      />
      {STATUS_LABEL[status] || STATUS_LABEL.none}
    </span>
  );
}
