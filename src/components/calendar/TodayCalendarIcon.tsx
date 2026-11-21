/**
 * Calendar page icon showing the current day-of-month number inside a miniature calendar frame.
 */
export function TodayCalendarIcon({ day }: { day: number }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="14" rx="3" />
      <path d="M6.5 2v2.5M13.5 2v2.5M2.5 7.5h15" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="700"
      >
        {day}
      </text>
    </svg>
  );
}
