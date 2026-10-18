export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`tianfu-brand-content${compact ? ' compact' : ''}`}>
    <span className="tianfu-logo"><img src="/tianfu-logo.jpg" alt="" width="48" height="48"/></span>
    <span>天府·慧研</span>
  </span>;
}
