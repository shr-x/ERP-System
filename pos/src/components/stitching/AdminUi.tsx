import type { ReactNode } from 'react';

export function StPage({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw-mx-auto tw-max-w-[1280px] tw-px-6 tw-py-6">
      <div className="tw-mb-8 tw-flex tw-items-start tw-justify-between tw-gap-4">
        <div>
          <div className="tw-text-[22px] tw-font-semibold tw-text-ink">{title}</div>
          {subtitle ? <div className="tw-mt-1 tw-text-[12px] tw-text-muted">{subtitle}</div> : null}
        </div>
        {right ? <div className="tw-flex tw-items-center tw-gap-2">{right}</div> : null}
      </div>
      <div className="tw-space-y-8">{children}</div>
    </div>
  );
}

export function StGrid12({ children }: { children: ReactNode }) {
  return <div className="tw-grid tw-grid-cols-12 tw-gap-6">{children}</div>;
}

export function StCard({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-shadow-soft">
      {title || right ? (
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-border-b tw-border-line tw-px-5 tw-py-4">
          <div className="tw-text-[16px] tw-font-medium tw-text-ink">{title || ''}</div>
          {right ? <div className="tw-flex tw-items-center tw-gap-2">{right}</div> : null}
        </div>
      ) : null}
      <div className="tw-p-5">{children}</div>
    </div>
  );
}

export function StSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tw-rounded-card tw-border tw-border-line tw-bg-white tw-shadow-soft">
      <div className="tw-border-b tw-border-line tw-px-5 tw-py-4">
        <div className="tw-text-[16px] tw-font-medium tw-text-ink">{title}</div>
      </div>
      <div className="tw-p-5">{children}</div>
    </div>
  );
}

export function StLabel({ children }: { children: ReactNode }) {
  return <div className="tw-text-[12px] tw-text-muted">{children}</div>;
}

export function StInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        'tw-h-10 tw-w-full tw-rounded-control tw-border tw-bg-white tw-px-3 tw-text-[14px] tw-text-ink tw-outline-none tw-transition',
        invalid ? 'tw-border-red-300 tw-ring-2 tw-ring-red-100' : 'tw-border-line focus:tw-ring-2 focus:tw-ring-slate-100 focus:tw-border-slate-300',
        className || ''
      ].join(' ')}
    />
  );
}

export function StSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        'tw-h-10 tw-w-full tw-rounded-control tw-border tw-bg-white tw-px-3 tw-text-[14px] tw-text-ink tw-outline-none tw-transition',
        invalid ? 'tw-border-red-300 tw-ring-2 tw-ring-red-100' : 'tw-border-line focus:tw-ring-2 focus:tw-ring-slate-100 focus:tw-border-slate-300',
        className || ''
      ].join(' ')}
    />
  );
}

export function StTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={[
        'tw-w-full tw-rounded-control tw-border tw-bg-white tw-px-3 tw-py-2 tw-text-[14px] tw-text-ink tw-outline-none tw-transition',
        invalid ? 'tw-border-red-300 tw-ring-2 tw-ring-red-100' : 'tw-border-line focus:tw-ring-2 focus:tw-ring-slate-100 focus:tw-border-slate-300',
        className || ''
      ].join(' ')}
    />
  );
}

export function StButton({
  variant,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const v = variant || 'secondary';
  const base = 'tw-h-10 tw-rounded-control tw-px-4 tw-text-[14px] tw-font-medium tw-transition disabled:tw-opacity-60 disabled:tw-cursor-not-allowed';
  const cls =
    v === 'primary'
      ? `${base} tw-bg-primary tw-text-white hover:tw-bg-ink`
      : v === 'danger'
        ? `${base} tw-bg-red-600 tw-text-white hover:tw-bg-red-700`
        : v === 'ghost'
          ? `${base} tw-bg-transparent tw-text-ink hover:tw-bg-slate-50`
          : `${base} tw-border tw-border-line tw-bg-white tw-text-ink hover:tw-bg-slate-50`;
  return (
    <button {...props} className={[cls, props.className || ''].join(' ')}>
      {children}
    </button>
  );
}

export function StBadge({ tone, children }: { tone: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const cls =
    tone === 'success'
      ? 'tw-border-emerald-200 tw-bg-emerald-50 tw-text-emerald-800'
      : tone === 'warning'
        ? 'tw-border-amber-200 tw-bg-amber-50 tw-text-amber-800'
        : tone === 'danger'
          ? 'tw-border-red-200 tw-bg-red-50 tw-text-red-800'
          : 'tw-border-slate-200 tw-bg-slate-50 tw-text-slate-800';
  return (
    <span className={`tw-inline-flex tw-items-center tw-rounded-full tw-border tw-px-2.5 tw-py-1 tw-text-[12px] tw-font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function StEmpty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="tw-rounded-card tw-border tw-border-dashed tw-border-line tw-bg-white tw-p-6 tw-text-center">
      <div className="tw-text-[14px] tw-font-medium tw-text-ink">{title}</div>
      {subtitle ? <div className="tw-mt-1 tw-text-[12px] tw-text-muted">{subtitle}</div> : null}
    </div>
  );
}

export function StModal({
  open,
  title,
  onClose,
  footer,
  children,
  width
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  children: ReactNode;
}) {
  if (!open) return null;
  const w = width === 'md' ? 'tw-max-w-[760px]' : width === 'xl' ? 'tw-max-w-[1100px]' : 'tw-max-w-[920px]';
  return (
    <div className="tw-fixed tw-inset-0 tw-z-[80] tw-flex tw-items-center tw-justify-center tw-bg-black/30 tw-p-6" onMouseDown={onClose}>
      <div
        className={`tw-flex tw-w-full tw-flex-col tw-overflow-hidden tw-rounded-card tw-border tw-border-line tw-bg-white tw-shadow-soft ${w} tw-max-h-[calc(100vh-48px)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-4 tw-border-b tw-border-line tw-px-5 tw-py-4">
          <div className="tw-text-[16px] tw-font-medium tw-text-ink">{title}</div>
          <StButton variant="ghost" onClick={onClose} type="button">
            Close
          </StButton>
        </div>
        <div className="tw-flex-1 tw-overflow-auto tw-p-5">{children}</div>
        {footer ? <div className="tw-border-t tw-border-line tw-bg-white tw-px-5 tw-py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
