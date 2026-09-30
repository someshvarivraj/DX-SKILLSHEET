/**
 * モラボット — the application's mascot.
 *
 * Drawn as inline SVG from the character sheet (2026-09-30), so it is sharp
 * at any size, needs no image files, and each expression is just a different
 * face on the same body:
 *
 *   default  にっこり   — the standard pose (logo, greetings)
 *   happy    喜ぶ       — something finished successfully
 *   trouble  困る       — an error, a page that does not exist
 *   think    考える     — reading a file, the AI writing, no search results
 *   explain  説明する   — empty screens and guidance
 *
 * Coordinates are in the character sheet's own 1440-px square, cropped by the
 * viewBox to the robot itself.
 */

export type MoraBotMood = 'default' | 'happy' | 'trouble' | 'think' | 'explain';

const C = {
  blue: '#2150B8',
  navy: '#0B2A6B',
  orange: '#FF9A33',
  green: '#148A0B',
  arm: '#4B78D6',
  bubble: '#8FB0EA',
  white: '#FFFFFF',
};

const LABELS: Record<MoraBotMood, string> = {
  default: 'モラボット',
  happy: 'モラボット（喜ぶ）',
  trouble: 'モラボット（困る）',
  think: 'モラボット（考える）',
  explain: 'モラボット（説明する）',
};

/** Ring eyes; `look` shifts the pupils (e.g. up and to the side to think). */
function RingEyes({ look = [0, 0], small = false }: { look?: [number, number]; small?: boolean }) {
  const r = small ? 62 : 75;
  return (
    <>
      {[600, 840].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={606} r={r} fill={C.blue} />
          <circle cx={cx} cy={606} r={r - 30} fill={C.white} />
          <circle cx={cx + look[0]} cy={606 + look[1]} r={15} fill={C.navy} />
        </g>
      ))}
    </>
  );
}

function Cheeks() {
  return (
    <>
      <circle cx={510} cy={708} r={30} fill={C.orange} />
      <circle cx={930} cy={708} r={30} fill={C.orange} />
    </>
  );
}

const stroke = { fill: 'none', stroke: C.blue, strokeWidth: 16, strokeLinecap: 'round' as const };

function Face({ mood }: { mood: MoraBotMood }) {
  switch (mood) {
    case 'happy':
      return (
        <>
          <path d="M540 625 Q600 560 660 625" {...stroke} strokeWidth={22} />
          <path d="M780 625 Q840 560 900 625" {...stroke} strokeWidth={22} />
          <path d="M630 685 Q720 770 810 685" {...stroke} />
          <Cheeks />
        </>
      );
    case 'trouble':
      return (
        <>
          <RingEyes small look={[0, 6]} />
          <path d="M535 520 L655 548" {...stroke} stroke={C.navy} strokeWidth={14} />
          <path d="M785 548 L905 520" {...stroke} stroke={C.navy} strokeWidth={14} />
          <path d="M670 728 Q720 695 770 728" {...stroke} stroke={C.navy} strokeWidth={12} />
          {/* A bead of sweat. */}
          <path d="M945 560 Q965 600 945 615 Q925 600 945 560 Z" fill={C.bubble} />
        </>
      );
    case 'think':
      return (
        <>
          <RingEyes look={[18, -18]} />
          <path d="M700 718 L740 718" {...stroke} stroke={C.navy} strokeWidth={12} />
        </>
      );
    case 'explain':
      return (
        <>
          <RingEyes />
          <ellipse cx={720} cy={712} rx={24} ry={18} fill={C.navy} />
          <Cheeks />
        </>
      );
    default:
      return (
        <>
          <RingEyes />
          <path d="M658 694 Q720 740 782 694" {...stroke} strokeWidth={14} />
          <Cheeks />
        </>
      );
  }
}

export function MoraBot({
  mood = 'default',
  size = 96,
  className = '',
  animate = false,
  headOnly = false,
  title,
}: {
  mood?: MoraBotMood;
  /** Height in px. */
  size?: number;
  className?: string;
  /** A gentle bob — for a MoraBot that is busy. */
  animate?: boolean;
  /** Just the head, for small marks such as the logo. */
  headOnly?: boolean;
  /** Accessible name; defaults to the mood's name. Pass '' for decoration. */
  title?: string;
}) {
  const label = title ?? LABELS[mood];
  const viewBox = headOnly ? '320 210 800 700' : '300 190 840 1000';
  const [, , w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];

  return (
    <svg
      viewBox={viewBox}
      height={size}
      width={(size * w) / h}
      className={`morabot ${animate ? 'morabot-busy' : ''} morabot-${mood} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {mood === 'think' ? (
        // Thought bubbles, top right of the head.
        <g className="morabot-bubbles" fill={C.bubble}>
          <circle cx={1010} cy={390} r={16} />
          <circle cx={1050} cy={340} r={24} />
          <circle cx={1095} cy={280} r={32} />
        </g>
      ) : null}

      {/* Antenna */}
      <rect x={711} y={290} width={18} height={90} fill={C.navy} />
      <circle className="morabot-antenna" cx={720} cy={263} r={42} fill={C.orange} />

      {/* Ears */}
      <rect x={330} y={540} width={60} height={144} rx={26} fill={C.orange} />
      <rect x={1050} y={540} width={60} height={144} rx={26} fill={C.orange} />

      {/* Head and face */}
      <rect x={390} y={372} width={660} height={528} rx={150} fill={C.blue} />
      <rect x={462} y={456} width={516} height={300} rx={110} fill={C.white} />
      <Face mood={mood} />

      {headOnly ? null : (
        <>
          {/* Arms, body, feet */}
          <ellipse cx={462} cy={1008} rx={48} ry={84} fill={C.arm} />
          <ellipse cx={978} cy={1008} rx={48} ry={84} fill={C.arm} />
          <rect x={540} y={912} width={360} height={204} rx={100} fill={C.green} />
          <circle cx={720} cy={1014} r={48} fill="none" stroke={C.white} strokeWidth={9} />
          <rect x={600} y={1116} width={96} height={48} rx={20} fill={C.navy} />
          <rect x={744} y={1116} width={96} height={48} rx={20} fill={C.navy} />
        </>
      )}
    </svg>
  );
}

/**
 * A progress bar that MoraBot rides along.
 *
 * With `percent`, MoraBot stands at the tip of the filled part and moves
 * forward as work completes. Without it (the amount of work is not known, e.g.
 * a file being read), MoraBot walks back and forth along the track.
 */
export function MoraBotProgress({
  percent,
  label,
  detail,
}: {
  percent?: number;
  label?: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const known = typeof percent === 'number';
  const p = known ? Math.max(0, Math.min(100, percent)) : 0;

  return (
    <div
      className="morabot-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(p) : undefined}
      aria-label={typeof label === 'string' ? label : '処理中'}
    >
      {label || detail ? (
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {label ? <span className="text-sm font-bold text-ink-900">{label}</span> : null}
          {detail ? <span className="tabular text-sm text-ink-500">{detail}</span> : null}
        </div>
      ) : null}
      <div className="morabot-track">
        {/* The bar is clipped to the track; MoraBot walks above it, unclipped. */}
        <div className="morabot-bar">
          <div
            className={`morabot-fill ${known ? '' : 'morabot-fill-indeterminate'}`}
            style={known ? { width: `${p}%` } : undefined}
          />
        </div>
        <div
          className={`morabot-rider ${known ? '' : 'morabot-rider-indeterminate'}`}
          style={known ? { left: `${p}%` } : undefined}
        >
          <MoraBot
            mood={known && p >= 100 ? 'happy' : 'think'}
            size={40}
            animate={!known || p < 100}
            title=""
          />
        </div>
      </div>
    </div>
  );
}
