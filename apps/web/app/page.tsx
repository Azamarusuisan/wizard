import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "../..");

export default function Page({ searchParams }: { searchParams?: { status?: string } }) {
  const status = readStatus();
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">LOCAL CONSOLE</p>
          <h1>Wizard</h1>
          <p className="lead">ローカルで生成、リード整理、確認を回すための操作画面。</p>
        </div>
        <a className="primaryLink" href="/admin/generations">生成ログ</a>
      </section>
      {searchParams?.status ? <p className="notice">{labelStatus(searchParams.status)}</p> : null}

      <section className="metrics" aria-label="現在の状態">
        <StatusCard label="リード" value={`${status.leadCount}件`} detail={status.leadsReady ? "tmp/leads.json" : "未作成"} tone={status.leadsReady ? "ok" : "warn"} />
        <StatusCard label="Phase 3" value={status.phase3Ready ? "確認可" : "未作成"} detail="tmp/phase-3-dummy" tone={status.phase3Ready ? "ok" : "warn"} />
        <StatusCard label="AIキー" value={status.aiReady ? "設定済み" : "未設定"} detail="ANTHROPIC / OPENAI" tone={status.aiReady ? "ok" : "muted"} />
        <StatusCard label="計測URL" value={status.eventsReady ? "設定済み" : "未設定"} detail="PUBLIC_EVENTS_BASE_URL" tone={status.eventsReady ? "ok" : "muted"} />
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>作業順</h2>
          <span>{status.latestCommit}</span>
        </div>
        <div className="steps">
          <Step title="リード取得" action="leads" command="npm run leads:fetch" meta="Google Placesキーなしならfixture 10件" />
          <Step title="3パターン生成" action="dummy" command="npm run phase3:dummy" meta="tmp/phase-3-dummy に確認用サイトを作成" />
          <Step title="セルフチェック" action="check" command="npm run check" meta="最低限の破損を確認" />
          <Step title="ローカル配信" command="npm run phase3:serve" meta="別ターミナルで起動して review.html から確認" />
        </div>
      </section>

      <section className="grid">
        <Info title="主要ファイル" items={["tmp/leads.csv", "tmp/leads.json", "tmp/phase-3-dummy/review.html", "docs/verify/phase-4.md"]} />
        <Info title="確認コマンド" items={["npm run check", "npm run build --workspace @craftsite/web", "npm run build --workspace @craftsite/site-template"]} />
      </section>

      <style>{css}</style>
    </main>
  );
}

function StatusCard(props: { label: string; value: string; detail: string; tone: "ok" | "warn" | "muted" }) {
  return (
    <article className={`metric ${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  );
}

function Step(props: { title: string; command: string; meta: string; action?: string }) {
  return (
    <article className="step">
      <div>
        <h3>{props.title}</h3>
        <p>{props.meta}</p>
      </div>
      <div className="run">
        <code>{props.command}</code>
        {props.action ? (
          <form action="/api/local/run" method="post">
            <input type="hidden" name="action" value={props.action} />
            <button type="submit">実行</button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function Info(props: { title: string; items: string[] }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      <ul className="fileList">
        {props.items.map((item) => <li key={item}><code>{item}</code></li>)}
      </ul>
    </section>
  );
}

function readStatus() {
  const leadsPath = join(root, "tmp/leads.json");
  const reportPath = join(root, "tmp/phase-3-dummy/report.json");
  const envPath = join(root, ".env");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  return {
    leadCount: readLeadCount(leadsPath),
    leadsReady: existsSync(leadsPath),
    phase3Ready: existsSync(reportPath),
    aiReady: hasEnv(env, "ANTHROPIC_API_KEY") && hasEnv(env, "ANTHROPIC_MODEL") && hasEnv(env, "OPENAI_API_KEY") && hasEnv(env, "OPENAI_VISION_MODEL"),
    eventsReady: hasEnv(env, "PUBLIC_EVENTS_BASE_URL"),
    latestCommit: readLatestCommit()
  };
}

function readLeadCount(path: string) {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function hasEnv(env: string, key: string) {
  return new RegExp(`^${key}=.+`, "m").test(env);
}

function readLatestCommit() {
  try {
    return readFileSync(join(root, ".git/refs/heads/master"), "utf8").trim().slice(0, 7);
  } catch {
    return "local";
  }
}

function labelStatus(status: string) {
  if (status.endsWith("-ok")) return "完了しました。";
  if (status.endsWith("-failed")) return "失敗しました。ターミナルで詳細を確認してください。";
  return "不明な操作です。";
}

const css = `
  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    background: #f4f6f3;
    color: #17201b;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
  }
  .shell { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 40px; }
  .hero {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    padding: 28px 0 22px;
    border-bottom: 1px solid #cfd8d0;
  }
  .eyebrow { margin: 0 0 8px; color: #587064; font-size: 13px; font-weight: 800; letter-spacing: 0; }
  h1 { margin: 0; font-size: 34px; line-height: 1.2; }
  .lead { margin: 10px 0 0; color: #4b5b52; font-size: 16px; }
  .primaryLink {
    flex: 0 0 auto;
    padding: 11px 14px;
    border-radius: 7px;
    background: #173f35;
    color: white;
    font-weight: 800;
    text-decoration: none;
  }
  .notice {
    margin: 14px 0 0;
    padding: 12px 14px;
    border: 1px solid #b9c8bd;
    border-radius: 7px;
    background: #eef7f1;
    color: #173f35;
    font-weight: 800;
  }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
  .metric {
    min-height: 118px;
    padding: 16px;
    border: 1px solid #cfd8d0;
    border-radius: 8px;
    background: white;
  }
  .metric span, .metric small { display: block; color: #607068; }
  .metric strong { display: block; margin: 10px 0 8px; font-size: 28px; line-height: 1.15; }
  .metric.ok { border-top: 4px solid #24724f; }
  .metric.warn { border-top: 4px solid #c58a18; }
  .metric.muted { border-top: 4px solid #9aa59f; }
  .panel {
    margin-top: 14px;
    padding: 18px;
    border: 1px solid #cfd8d0;
    border-radius: 8px;
    background: white;
  }
  .panelHead { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
  h2 { margin: 0 0 14px; font-size: 20px; line-height: 1.3; }
  .panelHead h2 { margin: 0; }
  .panelHead span { color: #607068; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .steps { display: grid; gap: 10px; margin-top: 16px; }
  .step {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(280px, 1.2fr);
    gap: 14px;
    align-items: center;
    padding: 14px;
    border: 1px solid #dfe5df;
    border-radius: 7px;
    background: #fbfcfb;
  }
  h3 { margin: 0 0 4px; font-size: 17px; }
  p { margin: 0; }
  .step p { color: #5b6a62; font-size: 14px; }
  code {
    display: block;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    border-radius: 6px;
    background: #18231d;
    color: #eef7f1;
    font-size: 13px;
    line-height: 1.45;
  }
  .run { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
  button {
    min-width: 72px;
    height: 40px;
    border: 0;
    border-radius: 7px;
    background: #173f35;
    color: white;
    font-weight: 800;
    cursor: pointer;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .fileList { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  @media (max-width: 820px) {
    .hero { align-items: flex-start; flex-direction: column; }
    .metrics, .grid, .step, .run { grid-template-columns: 1fr; }
    h1 { font-size: 28px; }
  }
`;
