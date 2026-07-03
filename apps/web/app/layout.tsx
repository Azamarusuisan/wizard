export const metadata = {
  title: "職人ホームページ制作所",
  description: "スマホで写真を送るだけ。まるごとおまかせ9,900円。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
