import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { openMigratedDatabase } from "../src/lib/db/application";
import { createClientRepository } from "../src/lib/clients/repository";
import { createOperationsRepository } from "../src/lib/operations/repository";
import { createProductionRepository } from "../src/lib/production/repository";

// SQLite header marker, not a new application table or a production setting.
const DEMO_APPLICATION_ID = 0x434c444d; // CLDM

export function demoDatabasePath(value: string | undefined, cwd = process.cwd()): string {
  const root = fs.realpathSync(cwd);
  const target = path.join(root, "data/demo/clckd-demo.db");
  const requested = value ? path.resolve(cwd, value) : null;
  if (!requested || (requested !== target && requested !== path.resolve(cwd, "data/demo/clckd-demo.db"))) {
    throw new Error("Set CLCKD_DB_PATH explicitly to this checkout's data/demo/clckd-demo.db. Other database paths are refused.");
  }
  for (const directory of [path.join(root, "data"), path.dirname(target)]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Demo directories must not be symlinks or files.");
  }
  for (const filename of [target, target + "-wal", target + "-shm", target + "-journal", path.join(path.dirname(target), "owner-setup-code")]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error("Demo files must be regular files, not symlinks or hard links.");
  }
  return target;
}

function assertDemoContent(db: Database.Database): void {
  const marker = db.pragma("application_id", { simple: true });
  if (marker === DEMO_APPLICATION_ID) return;
  if (marker !== 0) throw new Error("This database belongs to another application; it cannot become a demo.");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  // A freshly initialized DB may already have an interactively configured owner.
  for (const { name } of tables) {
    if (["kv_meta", "owner_account", "access_session", "access_attempt"].includes(name)) continue;
    if (db.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`).get()) {
      throw new Error("Unmarked database contains existing records. Refusing to seed, migrate or launch it as a demo.");
    }
  }
}

export function openDemoDatabase(value: string | undefined, cwd = process.cwd()): Database.Database {
  const dbPath = demoDatabasePath(value, cwd);
  if (fs.existsSync(dbPath)) {
    const existing = new Database(dbPath, { readonly: true, fileMustExist: true });
    try { assertDemoContent(existing); } finally { existing.close(); }
  }
  const db = openMigratedDatabase({ dbPath, migrationsDir: path.join(cwd, "src/lib/db/migrations") });
  try {
    db.transaction(() => {
      assertDemoContent(db);
      db.pragma(`application_id = ${DEMO_APPLICATION_ID}`);
    }).immediate();
    if (process.platform !== "win32") {
      fs.chmodSync(path.dirname(dbPath), 0o700);
      for (const filename of [dbPath, dbPath + "-wal", dbPath + "-shm"]) if (fs.existsSync(filename)) fs.chmodSync(filename, 0o600);
    }
    return db;
  } catch (error) { db.close(); throw error; }
}

export function seedDemoWorkspace(db: Database.Database, now = new Date()): boolean {
  assertDemoContent(db);
  if (db.pragma("application_id", { simple: true }) !== DEMO_APPLICATION_ID) throw new Error("Initialize the guarded demo database first.");
  return db.transaction(() => {
    // Never refresh dates, overwrite edits or duplicate an existing demonstration.
    if (db.prepare("SELECT 1 FROM client LIMIT 1").get() || db.prepare("SELECT 1 FROM project LIMIT 1").get()) return false;
    const clients = createClientRepository(db, { now: () => now });
    const operations = createOperationsRepository(db, { now: () => now });
    const production = createProductionRepository(db, { now: () => now });
    const date = (offset: number) => {
      const value = new Date(now); value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const northstar = clients.createClient({ name: "Northstar Creative Studio", kind: "organization", preferred_contact_name: "Alex Morgan (fictional)", email: "studio@example.com", city: "Lyon", country: "FR", notes: "Fictional demonstration client — no business records." });
    const fieldwork = clients.createClient({ name: "Fieldwork Coffee", kind: "organization", preferred_contact_name: "Sam River (fictional)", email: "hello@example.com", city: "Bristol", country: "GB" });
    const lumina = clients.createClient({ name: "Lumina Studio", kind: "organization", preferred_contact_name: "Robin Vale (fictional)", email: "projects@example.com", city: "Paris", country: "FR" });
    function create(clientId: string, title: string, shootOffset: number, main = false) {
      return production.createProduction({
        client_id: clientId, new_client_name: null, title, production_type: "film", approver_name: "Alex Morgan (fictional)",
        shoot_date: date(shootOffset), target_date: date(10), location: "Fictional Northstar Studio A", location_tz: "Europe/Paris",
        notes: "Fictional demo. A warm, human-led brand story: studio interview, location footage and considered pacing. Client publication rights remain separate from delivery.",
        outputs: [
          { title: "Brand Film", type: "final_master", format: "4K · 16:9 · 90 seconds", quantity: 1, revision_allowance: 2, due_date: date(7) },
          ...(main ? [
            { title: "Social Media Edits", type: "social_cutdown", format: "1080 × 1920 · 9:16 · 20 seconds", quantity: 3, revision_allowance: 2, due_date: date(9) },
            { title: "Promotional Cutdown", type: "social_cutdown", format: "1080p · 1:1 · 15 seconds", quantity: 1, revision_allowance: 2, due_date: date(10) },
          ] : []),
        ],
        payment_plan: main ? {
          total: "12000", currency: "EUR", contract_reference: "DEMO-NORTHSTAR-001",
          terms: "Fictional 30/30/40 agreement. External transfers only; two revision rounds. These are operator-entered records, not signatures or bank verification.",
          milestones: [
            { title: "Production advance", percentage: "30", payment_condition: "Before equipment rental and production", due_date: date(-6), work_gate: "production" },
            { title: "Production milestone", percentage: "30", payment_condition: "After filming, before post-production begins", due_date: date(-3), work_gate: "post_production" },
            { title: "Final handover", percentage: "40", payment_condition: "After approved masters are delivered externally", due_date: date(10), work_gate: "none" },
          ],
        } : null,
      });
    }
    const main = create(northstar.id, "Autumn Brand Campaign", -5, true);
    const studio = operations.listShoots(main)[0];
    production.saveShoot(main, studio.id, { project_id: main, shoot_date: date(-5), call_time_local: "09:00", location_tz: "Europe/Paris", location: "Fictional Northstar Studio A · interview", crew_notes: "Studio interview. Two-camera setup, soft key light, lavalier and boom. Crew call 09:00; interview 10:00." });
    production.saveShoot(main, null, { project_id: main, shoot_date: date(-4), call_time_local: "07:30", location_tz: "Europe/Paris", location: "Fictional Riverside location · brand footage", crew_notes: "Location shoot. Lightweight camera kit, natural light and product details. Travel and access agreed in the fictional brief." });
    production.confirmScope(main, production.getWorkspace(main)!.settings.scope_revision, true);
    for (const milestone of production.getWorkspace(main)!.paymentPlan!.milestones.slice(0, 2)) {
      production.recordMilestonePayment(main, { milestone_id: milestone.id, expected_plan_revision: 1, kind: "paid", confirmed: true, reference: "DEMO external transfer — fictional receipt" });
    }
    production.startProduction(main); production.completeShoot(main, true); production.startPostProduction(main);
    function expected(projectId: string, title: string) {
      const output = production.getWorkspace(projectId)!.outputs.find((item) => item.title === title)!;
      return { project_id: projectId, output_id: output.id, expected_revision: output.revision, expected_link: output.current.link, expected_scope_revision: output.scope_revision };
    }
    function submit(projectId: string, title: string, newRevision = false) {
      production.submitReview({ ...expected(projectId, title), link: `https://example.com/demo/${title.toLowerCase().replaceAll(" ", "-")}/v${newRevision ? 2 : 1}`, new_revision: newRevision, change_note: newRevision ? "Shortened opening, warmer grade and updated end card." : "Fictional HTTPS placeholder — not a playable film.", extra_revision_agreed: false });
    }
    function deliver(projectId: string) {
      submit(projectId, "Brand Film");
      for (const kind of ["approve", "deliver"] as const) production.recordDecision({ ...expected(projectId, "Brand Film"), kind, confirmed: true, details: null });
    }
    deliver(main); submit(main, "Social Media Edits");
    production.recordDecision({ ...expected(main, "Social Media Edits"), kind: "changes", confirmed: true, details: "Bring the product moment forward and shorten the opening." });
    submit(main, "Social Media Edits", true);
    const starters = operations.listTasks(main);
    const tasks = [
      ["Confirm creative brief", "done"], ["Prepare equipment", "done"], ["Schedule production", "done"],
      ["Film interviews", "done"], ["Organize footage", "done"], ["Edit first version", "done"],
      ["Process client feedback", "in_progress"], ["Finish approved masters", "todo"],
    ] as const;
    tasks.forEach(([title, status], index) => {
      const input = { project_id: main, title, status, description: "Fictional production task. Keep the deliverables aligned with the agreed scope.", priority: status === "in_progress" ? "high" : "normal", due_date: date(status === "in_progress" ? -1 : status === "done" ? -3 : 3) };
      if (starters[index]) operations.updateTask(starters[index].id, input); else operations.createTask(input);
    });
    const upcoming = create(fieldwork.id, "Coffee, People & Place", 2);
    const shoot = operations.listShoots(upcoming)[0];
    production.saveShoot(upcoming, shoot.id, { project_id: upcoming, shoot_date: date(2), call_time_local: "08:30", location_tz: "Europe/London", location: "Fictional Fieldwork roastery", crew_notes: "Coffee preparation, founder interview and product details. Camera, primes, soft light and two microphones." });
    production.confirmScope(upcoming, production.getWorkspace(upcoming)!.settings.scope_revision, true);
    operations.createTask({ project_id: upcoming, title: "Confirm roastery access and kit", description: "Fictional shoot preparation", priority: "high", due_date: date(1), status: "in_progress" });
    const completed = create(lumina.id, "Product Launch Film", -10);
    production.confirmScope(completed, 1, true); production.completeShoot(completed, true); deliver(completed);
    for (const task of operations.listTasks(completed)) operations.updateTask(task.id, { project_id: completed, title: task.title, description: null, priority: task.priority, due_date: date(-2), status: "done" });
    production.wrapProject(completed);
    return true;
  }).immediate();
}
