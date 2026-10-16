import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ulid } from "ulid";
import { z } from "zod";
import { recordId } from "../production/schema";
import { createProductionRepository } from "../production/repository";
import { normalizeSetupCode } from "./setup-code";

const rawToken = z.string().regex(/^[a-f0-9]{64}$/);
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const passwordSchema = z.string().min(15, "Use a passphrase of at least 15 characters").max(128);
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64, SCRYPT).toString("hex")}`;
}
function passwordMatches(password: string, hash: string) {
  const [method, salt, digest] = hash.split(":");
  if (method !== "scrypt" || !salt || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const actual = scryptSync(password, salt, 64, SCRYPT);
  return timingSafeEqual(actual, Buffer.from(digest, "hex"));
}
export class AccessDenied extends Error { constructor(message = "Sign in as the workspace owner to continue") { super(message); this.name = "AccessDenied"; } }
interface Session { role: "owner" | "project_viewer"; invitation_id: string | null; project_id: string | null; expires_at: string }
export interface InvitationSummary { id: string; project_id: string; recipient_name: string; share_payments: number; created_at: string; expires_at: string; claimed_at: string | null; revoked_at: string | null }

export function createAccessRepository(db: Database.Database, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const stamp = () => now().toISOString();
  function attempt(bucket: string, limit: number) {
    db.transaction(() => {
      const prior = db.prepare("SELECT attempts, resets_at FROM access_attempt WHERE bucket = ?").get(bucket) as { attempts: number; resets_at: string } | undefined;
      if (prior && prior.resets_at > stamp() && prior.attempts >= limit) throw new AccessDenied("Too many attempts. Try again in 15 minutes.");
      db.prepare("INSERT INTO access_attempt (bucket, attempts, resets_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN resets_at <= ? THEN 1 ELSE attempts + 1 END, resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END").run(bucket, new Date(now().getTime() + 15 * 60000).toISOString(), stamp(), stamp());
    }).immediate();
  }
  function issueSession(role: Session["role"], expiry: string, invitationId: string | null = null, projectId: string | null = null) {
    const token = secret();
    db.prepare("INSERT INTO access_session (token_hash, role, invitation_id, project_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(tokenHash(token), role, invitationId, projectId, stamp(), expiry);
    return { token, expires_at: expiry, project_id: projectId };
  }
  function session(token: string | undefined): Session | null {
    if (!token || !rawToken.safeParse(token).success) return null;
    return db.prepare("SELECT role, invitation_id, project_id, expires_at FROM access_session WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").get(tokenHash(token), stamp()) as Session | undefined ?? null;
  }
  function owner(token: string | undefined) {
    if (session(token)?.role !== "owner") throw new AccessDenied();
    const account = db.prepare("SELECT display_name, access_mode FROM owner_account WHERE id = 1").get() as { display_name: string; access_mode: "local_owner" } | undefined;
    if (!account) throw new AccessDenied();
    return account;
  }
  function viewer(token: string | undefined, projectId: string) {
    const current = session(token);
    if (current?.role !== "project_viewer" || current.project_id !== projectId) throw new AccessDenied("This client link is unavailable or no longer valid");
    const invitation = db.prepare(`SELECT i.* FROM access_invitation i JOIN project p ON p.id = i.project_id JOIN client c ON c.id = p.client_id WHERE i.id = ? AND i.project_id = ? AND i.revoked_at IS NULL AND i.expires_at > ? AND p.archived_at IS NULL AND c.archived_at IS NULL`).get(current.invitation_id, projectId, stamp()) as InvitationSummary | undefined;
    if (!invitation) throw new AccessDenied("This client link is unavailable or no longer valid");
    return invitation;
  }
  return {
    hasOwner: () => !!db.prepare("SELECT 1 FROM owner_account WHERE id = 1").get(),
    owner,
    setup(input: unknown, expectedBootstrapCode: string) {
      attempt("owner_setup", 5);
      const value = z.strictObject({ display_name: z.string().trim().min(1).max(100), password: passwordSchema, bootstrap_code: z.string().max(96) }).parse(input);
      const suppliedCode = normalizeSetupCode(value.bootstrap_code);
      const expectedCode = normalizeSetupCode(expectedBootstrapCode);
      if (!suppliedCode || !expectedCode || !timingSafeEqual(Buffer.from(tokenHash(suppliedCode)), Buffer.from(tokenHash(expectedCode)))) throw new AccessDenied("Check your 12-character local setup code. Spaces and hyphens are optional.");
      const hash = passwordHash(value.password);
      return db.transaction(() => {
        if (db.prepare("SELECT 1 FROM owner_account").get()) throw new AccessDenied("The owner is already configured. Sign in instead.");
        db.prepare("INSERT INTO owner_account (id, display_name, password_hash, created_at) VALUES (1, ?, ?, ?)").run(value.display_name, hash, stamp());
        return issueSession("owner", new Date(now().getTime() + 8 * 3600000).toISOString());
      }).immediate();
    },
    login(password: string) {
      attempt("owner_login", 5);
      const account = db.prepare("SELECT password_hash FROM owner_account WHERE id = 1").get() as { password_hash: string } | undefined;
      if (!account || password.length > 128 || !passwordMatches(password, account.password_hash)) throw new AccessDenied("Sign-in failed. Check your passphrase.");
      db.prepare("UPDATE access_attempt SET attempts = 0 WHERE bucket = 'owner_login'").run();
      return issueSession("owner", new Date(now().getTime() + 8 * 3600000).toISOString());
    },
    logout(token: string | undefined) { if (token && rawToken.safeParse(token).success) db.prepare("UPDATE access_session SET revoked_at = ? WHERE token_hash = ?").run(stamp(), tokenHash(token)); },
    createInvitation(ownerToken: string | undefined, input: unknown) {
      owner(ownerToken);
      const value = z.strictObject({ project_id: recordId, recipient_name: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(30), share_payments: z.boolean(), output_ids: z.array(recordId).max(20) }).parse(input);
      return db.transaction(() => {
        const project = db.prepare("SELECT id FROM project WHERE id = ? AND archived_at IS NULL").get(value.project_id);
        if (!project) throw new AccessDenied("Choose an active project");
        for (const id of new Set(value.output_ids)) if (!db.prepare("SELECT 1 FROM deliverable WHERE id = ? AND project_id = ? AND archived_at IS NULL").get(id, value.project_id)) throw new AccessDenied("Choose only active outputs belonging to this project");
        const token = secret(), id = ulid();
        const expires = new Date(now().getTime() + value.days * 86400000).toISOString();
        db.prepare("INSERT INTO access_invitation (id, project_id, recipient_name, token_hash, share_payments, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, value.project_id, value.recipient_name, tokenHash(token), value.share_payments ? 1 : 0, stamp(), expires);
        for (const outputId of new Set(value.output_ids)) db.prepare("INSERT INTO invitation_output VALUES (?, ?)").run(id, outputId);
        return { id, token, expires_at: expires };
      }).immediate();
    },
    listInvitations(ownerToken: string | undefined, projectId: string) {
      owner(ownerToken); recordId.parse(projectId);
      return db.prepare("SELECT id, project_id, recipient_name, share_payments, created_at, expires_at, claimed_at, revoked_at FROM access_invitation WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as InvitationSummary[];
    },
    revokeInvitation(ownerToken: string | undefined, id: string, projectId: string) {
      owner(ownerToken); recordId.parse(id); recordId.parse(projectId);
      db.transaction(() => {
        const result = db.prepare("UPDATE access_invitation SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND project_id = ?").run(stamp(), id, projectId);
        if (!result.changes) throw new AccessDenied("Invitation not found in this project");
        db.prepare("UPDATE access_session SET revoked_at = COALESCE(revoked_at, ?) WHERE invitation_id = ?").run(stamp(), id);
      }).immediate();
    },
    claimInvitation(token: string) {
      attempt("invitation_claim", 30); rawToken.parse(token);
      return db.transaction(() => {
        const invitation = db.prepare(`SELECT i.* FROM access_invitation i JOIN project p ON p.id = i.project_id JOIN client c ON c.id = p.client_id WHERE token_hash = ? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND p.archived_at IS NULL AND c.archived_at IS NULL`).get(tokenHash(token), stamp()) as InvitationSummary | undefined;
        if (!invitation) throw new AccessDenied("This invitation was used, expired or revoked. Ask the owner for a new link.");
        db.prepare("UPDATE access_invitation SET claimed_at = ? WHERE id = ?").run(stamp(), invitation.id);
        return issueSession("project_viewer", invitation.expires_at, invitation.id, invitation.project_id);
      }).immediate();
    },
    guestProject(token: string | undefined, projectId: string) {
      const invitation = viewer(token, projectId);
      const workspace = createProductionRepository(db).getWorkspace(projectId)!;
      const allowed = new Set((db.prepare("SELECT deliverable_id FROM invitation_output WHERE invitation_id = ?").all(invitation.id) as { deliverable_id: string }[]).map((row) => row.deliverable_id));
      return {
        id: workspace.project.id, title: workspace.project.title, client_name: workspace.project.client_name,
        recipient_name: invitation.recipient_name, expires_at: invitation.expires_at,
        scope_revision: workspace.settings.scope_revision, scope_confirmed: !!workspace.settings.scope_confirmed_at,
        shoot_completed: !!workspace.settings.shoot_completed_at, target_date: workspace.project.end_date,
        outputs: workspace.outputs.filter((item) => allowed.has(item.id)).map((item) => ({ id: item.id, title: item.title, format: item.format, quantity: item.quantity, revision_allowance: item.revision_allowance, due_date: item.due_date, revision: item.revision, link: item.current.review_status === "not_submitted" ? null : item.current.link, submitted: item.current.review_status !== "not_submitted", approved: item.current.review_status === "approved", delivered: !!item.current.delivered_at })),
        payment_plan: invitation.share_payments && workspace.paymentPlan ? { currency: workspace.paymentPlan.currency, total_minor_units: workspace.paymentPlan.total_minor_units, terms: workspace.paymentPlan.terms, milestones: workspace.paymentPlan.milestones.map((item) => ({ title: item.title, basis_points: item.basis_points, amount_minor_units: item.amount_minor_units, payment_condition: item.payment_condition, due_date: item.due_date, paid: !!item.paid_at })) } : null,
      };
    },
  };
}
export type ClientProjectSnapshot = ReturnType<ReturnType<typeof createAccessRepository>["guestProject"]>;
