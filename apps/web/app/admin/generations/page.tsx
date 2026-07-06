export default function GenerationsPage() {
  return (
    <main className="shell">
      <header>
        <a href="/">Wizard</a>
        <h1>生成ログ</h1>
      </header>
      <section className="panel">
        <form action="/api/admin/retry-generation" method="post">
          <label>
            注文ID
            <input name="orderId" required placeholder="order id" />
          </label>
          <button type="submit">再実行</button>
        </form>
      </section>
      <style>{css}</style>
    </main>
  );
}

const css = `
  :global(body) {
    margin: 0;
    background: #f4f6f3;
    color: #17201b;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
  }
  .shell { width: min(760px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0; }
  header { display: flex; align-items: end; justify-content: space-between; gap: 16px; border-bottom: 1px solid #cfd8d0; padding-bottom: 18px; }
  h1 { margin: 0; font-size: 30px; }
  a { color: #173f35; font-weight: 800; text-decoration: none; }
  .panel { margin-top: 18px; padding: 18px; border: 1px solid #cfd8d0; border-radius: 8px; background: white; }
  form { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
  label { display: grid; gap: 8px; color: #4b5b52; font-weight: 800; }
  input { height: 42px; padding: 8px 10px; border: 1px solid #b9c8bd; border-radius: 7px; font: inherit; }
  button { height: 42px; padding: 0 16px; border: 0; border-radius: 7px; background: #173f35; color: white; font-weight: 800; }
  @media (max-width: 640px) { form { grid-template-columns: 1fr; } }
`;
