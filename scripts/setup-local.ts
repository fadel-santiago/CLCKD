import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { openMigratedDatabase } from "../src/lib/db/application";
import { DEFAULT_DB_PATH } from "../src/lib/db/index";
import { readSchemaVersion } from "../src/lib/db/schema-version";
import { readLocalSetupCode } from "../src/lib/access/setup-code";

// Match Next.js environment-file loading; shell variables take precedence.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

try {
  const dbPath = path.resolve(process.env.CLCKD_DB_PATH ?? DEFAULT_DB_PATH);
  const db = openMigratedDatabase({ dbPath });
  try {
    console.log(`Local database ready (schema ${readSchemaVersion(db)}).`);
    if (db.prepare("SELECT 1 FROM owner_account WHERE id = 1").get()) {
      console.log("Owner already configured. Sign in with your existing passphrase; nothing was reset.");
    } else {
      const code = readLocalSetupCode(path.join(path.dirname(dbPath), "owner-setup-code"));
      console.log(`Local setup code: ${code}`);
      console.log("Keep this code private. It is needed only once; choose your own passphrase in the browser.");
    }
    console.log("Run npm run dev, then open http://127.0.0.1:3300/access.");
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exitCode = 1;
}
