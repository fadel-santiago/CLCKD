import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { demoDatabasePath, openDemoDatabase, seedDemoWorkspace } from "./demo-workspace";
import { readLocalSetupCode } from "../src/lib/access/setup-code";

try {
  const action = process.argv[2];
  if (!["setup", "seed", "dev"].includes(action)) throw new Error("Use npm run demo:setup, demo:seed or demo:dev.");
  // Deliberately do not load .env files: the demo target must be explicit.
  const dbPath = demoDatabasePath(process.env.CLCKD_DB_PATH);
  const db = openDemoDatabase(dbPath);
  try {
    if (action === "setup") {
      if (db.prepare("SELECT 1 FROM owner_account WHERE id = 1").get()) console.log("Existing demo owner preserved. Sign in with your own passphrase.");
      else {
        const code = readLocalSetupCode(path.join(path.dirname(dbPath), "owner-setup-code"));
        console.log(`Local demo setup code: ${code}`);
        console.log("Choose your own passphrase interactively at http://127.0.0.1:3301/access. Never share this code.");
      }
    }
    if (action === "seed") console.log(seedDemoWorkspace(db) ? "Seeded 3 fictional clients/projects. No owner credentials were created." : "Existing demo retained unchanged; no records or dates were reset.");
    if (db.pragma("integrity_check", { simple: true }) !== "ok" || (db.pragma("foreign_key_check") as unknown[]).length) throw new Error("Demo database integrity validation failed.");
    console.log(`Demo database: ${dbPath}`);
  } finally { db.close(); }
  if (action === "dev") {
    const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
    const result = spawnSync(process.execPath, [next, "dev", "-H", "127.0.0.1", "-p", "3301"], { stdio: "inherit", env: { ...process.env, CLCKD_DB_PATH: dbPath } });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? (result.signal === "SIGINT" ? 130 : 1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo setup failed.");
  process.exitCode = 1;
}
