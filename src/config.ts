export type Config = {
  botToken: string;
  openrouterApiKey: string;
  botOwnerId: string;
  webappUrl: string;
  webhookUrl: string | undefined;
  keydbUrl: string;
  port: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const required = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  const port = env.PORT ? Number(env.PORT) : 8080;
  if (Number.isNaN(port)) throw new Error(`PORT must be a number, got: ${env.PORT}`);

  return {
    botToken: required("BOT_TOKEN"),
    openrouterApiKey: required("OPENROUTER_API_KEY"),
    botOwnerId: required("BOT_OWNER_ID"),
    webappUrl: required("WEBAPP_URL"),
    webhookUrl: env.WEBHOOK_URL,
    keydbUrl: env.KEYDB_URL ?? "redis://localhost:6379",
    port,
  };
}
