export default function GenerationsPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>生成一覧</h1>
      <p>Supabase の `generation_logs` と `sites` を確認し、失敗した注文はここから再実行します。</p>
      <form action="/api/admin/retry-generation" method="post">
        <label>
          注文ID
          <input name="orderId" required style={{ display: "block", margin: "8px 0", padding: 8, width: 360 }} />
        </label>
        <button type="submit">再実行</button>
      </form>
    </main>
  );
}
