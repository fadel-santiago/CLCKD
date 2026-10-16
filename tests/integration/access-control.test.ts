import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { openMigratedDatabase } from "../../src/lib/db/application";
import { createProductionRepository } from "../../src/lib/production/repository";
import { AccessDenied, createAccessRepository, tokenHash } from "../../src/lib/access/repository";
import { validateLocalOrigin } from "../../src/lib/access/origin";
import { normalizeSetupCode, readLocalSetupCode } from "../../src/lib/access/setup-code";

describe("local owner and project-scoped client access", () => {
  let db: Database.Database, directory: string, time: Date;
  let access: ReturnType<typeof createAccessRepository>;
  const passphrase = "Fictional-test-owner-passphrase";
  let setupCode: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-access-"));
    db = openMigratedDatabase({ dbPath: path.join(directory, "test.db") });
    time = new Date("2026-10-12T09:00:00Z"); setupCode = randomBytes(32).toString("hex");
    access = createAccessRepository(db, { now: () => time });
  });
  afterEach(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const setup = () => access.setup({ display_name: "Fictional owner", password: passphrase, bootstrap_code: setupCode }, setupCode).token;
  function project(title = "Shared fictional production") {
    const production = createProductionRepository(db);
    const id = production.createProduction({ client_id: null, new_client_name: "Fictional client", title, production_type: "film", approver_name: "Test approver", shoot_date: null, target_date: null, location: null, location_tz: "Europe/Paris", notes: "INTERNAL-BRIEF-CANARY", outputs: [
      { title: "Shared hero film", type: "final_master", format: "4K", quantity: 1, revision_allowance: 2, due_date: null },
      { title: "PRIVATE-OUTPUT-CANARY", type: "social_cutdown", format: "Vertical", quantity: 1, revision_allowance: 2, due_date: null },
    ], payment_plan: { total: "1000", currency: "EUR", contract_reference: "PRIVATE-CONTRACT-REF", terms: "Commercial terms", milestones: [{ title: "Deposit", percentage: "100", payment_condition: "Before work", due_date: null }] } });
    const workspace = production.getWorkspace(id)!;
    const shared = workspace.outputs.find((item) => item.title === "Shared hero film")!;
    const hidden = workspace.outputs.find((item) => item.title === "PRIVATE-OUTPUT-CANARY")!;
    db.prepare("UPDATE output_version SET link = ? WHERE deliverable_id = ?").run("https://example.com/PRIVATE-LINK-CANARY", hidden.id);
    const milestone = workspace.paymentPlan!.milestones[0];
    production.recordMilestonePayment(id, { milestone_id: milestone.id, expected_plan_revision: 1, kind: "paid", confirmed: true, reference: "PRIVATE-RECEIPT-CANARY" });
    return { id, shared, hidden };
  }
  function invite(owner: string, selected: ReturnType<typeof project>, sharePayments = false) {
    return access.createInvitation(owner, { project_id: selected.id, recipient_name: "Fictional viewer", days: 7, share_payments: sharePayments, output_ids: [selected.shared.id] });
  }
  it("requires bootstrap possession, a long passphrase and a single owner", () => {
    expect(() => access.setup({ display_name:"Test",password:passphrase,bootstrap_code:"0".repeat(64) }, setupCode)).toThrow(AccessDenied);
    expect(() => access.setup({ display_name:"Test",password:"short",bootstrap_code:setupCode }, setupCode)).toThrow();
    const owner = setup(); expect(access.owner(owner)).toMatchObject({access_mode:"local_owner"});
    expect(() => setup()).toThrow("already configured");
    const stored = db.prepare("SELECT password_hash FROM owner_account").get() as {password_hash:string};
    expect(stored.password_hash).not.toContain(passphrase); expect(stored.password_hash).toMatch(/^scrypt:/);
  });
  it("uses hashed opaque sessions, rejects wrong credentials and revokes logout", () => {
    const first = setup(); expect(() => access.login("not the password")).toThrow(AccessDenied);
    const second = access.login(passphrase).token; expect(second).not.toBe(first);
    expect(db.prepare("SELECT 1 FROM access_session WHERE token_hash = ?").get(first)).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM access_session WHERE token_hash = ?").get(tokenHash(first))).toBeDefined();
    access.logout(first); expect(() => access.owner(first)).toThrow(AccessDenied); expect(access.owner(second)).toBeDefined();
    time = new Date(time.getTime()+8*3600000); expect(() => access.owner(second)).toThrow(AccessDenied);
  });
  it("sets up with the short grouped code, accepting lower case and spaces", () => {
    const code = readLocalSetupCode(path.join(directory, "owner-setup-code"));
    const session = access.setup({ display_name: "Fictional owner", password: passphrase, bootstrap_code: code.toLowerCase().replaceAll("-", " ") }, code);
    expect(access.owner(session.token).display_name).toBe("Fictional owner");
    expect(session.token).toHaveLength(64);
    expect(() => access.setup({ display_name: "Other owner", password: passphrase, bootstrap_code: code }, code)).toThrow("already configured");
  });
  it("accepts both short and legacy forms during the upgrade", () => {
    const short = normalizeSetupCode(setupCode)!;
    expect(() => access.setup({ display_name: "Test", password: passphrase, bootstrap_code: "ZZZZ-ZZZZ-ZZZZ" }, short)).toThrow(AccessDenied);
    const session = access.setup({ display_name: "Test", password: passphrase, bootstrap_code: setupCode }, short);
    expect(access.owner(session.token)).toBeDefined();
  });
  it("keeps the five-attempt setup limit for short codes and allows retry after cooldown", () => {
    const code = "ABCD-EFGH-JKLM";
    for (let index = 0; index < 5; index++) {
      expect(() => access.setup({ display_name: "Test", password: passphrase, bootstrap_code: "ZZZZ-ZZZZ-ZZZZ" }, code)).toThrow(AccessDenied);
    }
    expect(() => access.setup({ display_name: "Test", password: passphrase, bootstrap_code: code }, code)).toThrow("Too many");
    expect(access.hasOwner()).toBe(false);
    time = new Date(time.getTime() + 15 * 60000);
    const session = access.setup({ display_name: "Test", password: passphrase, bootstrap_code: code }, code);
    expect(access.owner(session.token)).toBeDefined();
  });
  it("rate limits owner sign-in and permits attempts after the cooldown", () => {
    setup(); for(let index=0;index<5;index++) expect(()=>access.login("wrong")).toThrow(AccessDenied);
    expect(()=>access.login(passphrase)).toThrow("Too many"); time=new Date(time.getTime()+15*60000);
    expect(access.login(passphrase).token).toHaveLength(64);
  });
  it("claims an invitation once and never escalates a client session to owner", () => {
    const owner=setup(), production=project(), invitation=invite(owner,production);
    const guest=access.claimInvitation(invitation.token).token;
    expect(()=>access.claimInvitation(invitation.token)).toThrow("used");
    expect(()=>access.owner(guest)).toThrow(AccessDenied);
    expect(()=>invite(guest,production)).toThrow(AccessDenied);
    expect(()=>access.listInvitations(guest,production.id)).toThrow(AccessDenied);
    expect(()=>access.revokeInvitation(guest,invitation.id,production.id)).toThrow(AccessDenied);
    expect(JSON.stringify(access.listInvitations(owner,production.id))).not.toContain(invitation.token);
  });
  it("returns only selected project outputs and excludes private data from the client payload", () => {
    const owner=setup(), production=project(), guest=access.claimInvitation(invite(owner,production).token).token;
    const snapshot=access.guestProject(guest,production.id); expect(snapshot.outputs.map(item=>item.id)).toEqual([production.shared.id]);
    expect(snapshot.payment_plan).toBeNull(); expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-|INTERNAL-|password_hash|token_hash|tasks|events/);
    db.prepare("UPDATE output_version SET link = ? WHERE deliverable_id = ?").run("https://example.com/UNSUBMITTED-CANARY", production.shared.id);
    expect(access.guestProject(guest,production.id).outputs[0].link).toBeNull();
  });
  it("shares commercial terms only by explicit permission and never receipt evidence", () => {
    const owner=setup(), production=project(), guest=access.claimInvitation(invite(owner,production,true).token).token;
    const snapshot=access.guestProject(guest,production.id); expect(snapshot.payment_plan?.terms).toBe("Commercial terms");
    expect(snapshot.payment_plan?.milestones[0].paid).toBe(true); expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-RECEIPT|PRIVATE-CONTRACT-REF/);
  });
  it("rejects project-ID changes and cross-project output grants atomically", () => {
    const owner=setup(), first=project(), other=project("PRIVATE-PROJECT-CANARY");
    const guest=access.claimInvitation(invite(owner,first).token).token;
    expect(()=>access.guestProject(guest,other.id)).toThrow(AccessDenied);
    expect(()=>access.createInvitation(owner,{project_id:first.id,recipient_name:"Test",days:7,share_payments:false,output_ids:[other.shared.id]})).toThrow(AccessDenied);
    expect(access.listInvitations(owner,first.id)).toHaveLength(1);
  });
  it("blocks active sessions immediately after revocation", () => {
    const owner=setup(), production=project(), invitation=invite(owner,production);
    const guest=access.claimInvitation(invitation.token).token;
    access.revokeInvitation(owner,invitation.id,production.id);
    expect(()=>access.guestProject(guest,production.id)).toThrow(AccessDenied);
    expect(()=>access.claimInvitation(invitation.token)).toThrow(AccessDenied);
  });
  it("expires invitations and sessions and excludes archived parents and outputs", () => {
    const owner=setup(), production=project(), invitation=invite(owner,production);
    const guest=access.claimInvitation(invitation.token).token;
    db.prepare("UPDATE deliverable SET archived_at = ? WHERE id=?").run(time.toISOString(),production.shared.id);
    expect(access.guestProject(guest,production.id).outputs).toEqual([]);
    db.prepare("UPDATE project SET archived_at = ? WHERE id=?").run(time.toISOString(),production.id);
    expect(()=>access.guestProject(guest,production.id)).toThrow(AccessDenied);
    db.prepare("UPDATE project SET archived_at = NULL WHERE id=?").run(production.id);
    time=new Date(time.getTime()+7*86400000);
    expect(()=>access.guestProject(guest,production.id)).toThrow(AccessDenied);
  });
  it("does not let a revoked invitation in another project be addressed by a tampered form", () => {
    const owner=setup(), production=project(), other=project();const invitation=invite(owner,production);
    expect(()=>access.revokeInvitation(owner,invitation.id,other.id)).toThrow(AccessDenied);
    expect(access.claimInvitation(invitation.token).project_id).toBe(production.id);
  });
});
describe("local-only origin boundary",()=>{
  it.each(["localhost:3300","127.0.0.1:3301","[::1]:3300"])("accepts same-origin local requests: %s",host=>{expect(validateLocalOrigin(host,`http://${host}`,true)).toBe(`http://${host}`);});
  it.each([null,"example.com","localhost@evil.example","localhost/path","192.168.1.1:3300"])("rejects nonlocal or malformed hosts: %s",host=>{expect(()=>validateLocalOrigin(host)).toThrow();});
  it("rejects missing, cross-host and cross-port mutation origins",()=>{
    for(const origin of [null,"http://evil.example","http://127.0.0.1:3301","null"])expect(()=>validateLocalOrigin("127.0.0.1:3300",origin,true)).toThrow();
  });
});
