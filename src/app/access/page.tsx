import { accessRepository, localBootstrapCode, requestOrigin } from "@/lib/access/server";
import { AccessForm } from "./access-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "Owner access", robots: { index: false, follow: false } };
const setupCommand = `docker exec -w /workspaces/clckd clckd-preview node -e 'process.stdout.write(require("node:fs").readFileSync("data/owner-setup-code","utf8"))'`;
export default async function AccessPage() {
  await requestOrigin(); const setup = !accessRepository().hasOwner();
  if (setup) localBootstrapCode();
  return <main className="page"><header className="pageHeader"><div><span className="eyebrow">Your private production desk</span><h1 className="pageTitle">{setup ? "Make this workspace yours." : "Welcome back."}</h1><p className="pageLead">Owner access manages productions. Client invitations open only the assigned, read-only project view.</p></div></header>
    <AccessForm setup={setup} />
    {setup && <details className="disclosure"><summary>Where do I find my 12-character setup code?</summary><p>Run this on your Mac, then paste the displayed code above. It looks like XXXX-XXXX-XXXX. This is a one-time setup check, not something you need at every sign-in. Keep the code and your passphrase out of chats and screenshots.</p><pre style={{ overflowX: "auto" }}>{setupCommand}</pre></details>}
    <p className="fieldHint">Local access pilot · subscriptions, email delivery and account recovery are not enabled. This is not a public signup page.</p>
  </main>;
}
