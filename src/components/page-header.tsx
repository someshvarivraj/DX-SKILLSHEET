/**
 * A screen's heading: the title, at most one line saying what the screen is
 * for, and the screen's main actions on the right. Every screen uses this so
 * they all start the same way.
 */
export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {lead ? <p className="page-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
