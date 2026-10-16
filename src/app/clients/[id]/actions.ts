"use server";
import { requireOwnerAction } from "@/lib/access/server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getApplicationClientRepository } from "@/lib/db/application";

function optional(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function updateClientAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const id = String(formData.get("id") ?? "");
  try {
    const client = getApplicationClientRepository().updateClient(id, {
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind") ?? "organization"),
      preferred_contact_name: optional(formData, "preferred_contact_name"),
      email: optional(formData, "email"),
      phone: optional(formData, "phone"),
      address_line1: optional(formData, "address_line1"),
      address_line2: optional(formData, "address_line2"),
      city: optional(formData, "city"),
      region: optional(formData, "region"),
      postal_code: optional(formData, "postal_code"),
      country: optional(formData, "country"),
      notes: optional(formData, "notes"),
    });
    if (client === null) throw new Error("Client not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Client could not be updated";
    redirect(`/clients/${id}?error=${encodeURIComponent(message.slice(0, 220))}`);
  }
  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/projects");
  redirect(`/clients/${id}?notice=${encodeURIComponent("Client updated")}`);
}
