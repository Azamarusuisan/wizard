export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="num" style={{ fontSize: 24, marginTop: 6 }}>{value}</div>
    </div>
  );
}
