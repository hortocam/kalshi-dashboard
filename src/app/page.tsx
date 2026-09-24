export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Kalshi Research Dashboard
      </h1>
      <p className="text-muted-foreground max-w-prose text-sm">
        Scaffold phase (P1): sidebar shell, configuration, and the health
        endpoint are live. Homepage sections (overall P&amp;L, per-family cards,
        skill changes, recommendations banner) arrive in Phase P3.
      </p>
    </div>
  );
}