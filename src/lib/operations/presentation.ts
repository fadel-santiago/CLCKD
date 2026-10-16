import type {
  Deliverable,
  Invoice,
  Project,
  Task,
} from "./schema";

export const PROJECT_STATUS_LABELS: Record<Project["status"], string> = {
  lead: "Lead",
  proposed: "Proposed",
  booked: "Booked",
  in_production: "In production",
  post_production: "Post production",
  completed: "Completed",
  on_hold: "On hold",
};

export const PROJECT_NEXT_ACTIONS: Record<Project["status"], string> = {
  lead: "Qualify lead",
  proposed: "Follow up proposal",
  booked: "Prepare production",
  in_production: "Open production",
  post_production: "Continue post",
  completed: "Review completed job",
  on_hold: "Review hold",
};

export const TASK_STATUS_LABELS: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const PRIORITY_LABELS: Record<Task["priority"], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const REVIEW_STATUS_LABELS: Record<Deliverable["review_status"], string> = {
  not_submitted: "Not submitted",
  awaiting_review: "Awaiting review",
  in_review: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

export const DELIVERABLE_TYPE_LABELS: Record<Deliverable["type"], string> = {
  edit_master: "Edit master",
  color_grade: "Color grade",
  rough_cut: "Rough cut",
  final_master: "Final master",
  thumbnail: "Thumbnail",
  stills: "Stills",
  audio_master: "Audio master",
  social_cutdown: "Social cutdown",
  other: "Other",
};

export const INVOICE_STATUS_LABELS: Record<Invoice["invoice_status"], string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const PAYMENT_STATUS_LABELS: Record<Invoice["payment_status"], string> = {
  unpaid: "Unpaid",
  partial: "Part paid",
  paid: "Paid",
  overdue: "Overdue",
};

export function projectStatusTone(status: Project["status"]): "accent" | "success" | "warning" | undefined {
  if (status === "completed") return "success";
  if (status === "on_hold") return "warning";
  if (status === "in_production" || status === "post_production") return "accent";
  return undefined;
}
