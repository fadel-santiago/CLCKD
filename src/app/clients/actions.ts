"use server";

/**
 * Production Batch 2C2C — client server actions.
 *
 * Thin server-action wrappers over the synchronous client mutations in
 * `src/lib/clients/mutations.ts`. All parsing, validation, and repository
 * behavior lives in the mutations module; these functions only:
 *
 * - obtain the application client repository via
 *   `getApplicationClientRepository()`;
 * - delegate to the corresponding mutation function;
 * - revalidate the `/clients` path, and only after a successful mutation;
 * - return the `ClientMutationState` unchanged.
 *
 * Deliberately out of scope: redirects, error catching, and any duplication
 * of parsing, validation, SQL, or repository behavior.
 */
import { revalidatePath } from "next/cache";
import { getApplicationClientRepository } from "@/lib/db/application";
import {
  archiveClientFromForm,
  createClientFromForm,
  unarchiveClientFromForm,
  type ClientMutationState,
} from "@/lib/clients/mutations";

/**
 * Server action: create a client from form data.
 *
 * Delegates to {@link createClientFromForm}; revalidates `/clients` only on
 * success and returns the mutation state unchanged.
 */
export async function createClientAction(
  previousState: ClientMutationState,
  formData: FormData
): Promise<ClientMutationState> {
  void previousState;
  const repository = getApplicationClientRepository();
  const result = createClientFromForm(repository, formData);
  if (result.status === "success") {
    revalidatePath("/clients");
  }
  return result;
}

/**
 * Server action: archive a client by ID from form data.
 *
 * Delegates to {@link archiveClientFromForm}; revalidates `/clients` only on
 * success and returns the mutation state unchanged.
 */
export async function archiveClientAction(
  previousState: ClientMutationState,
  formData: FormData
): Promise<ClientMutationState> {
  void previousState;
  const repository = getApplicationClientRepository();
  const result = archiveClientFromForm(repository, formData);
  if (result.status === "success") {
    revalidatePath("/clients");
  }
  return result;
}

/**
 * Server action: unarchive a client by ID from form data.
 *
 * Delegates to {@link unarchiveClientFromForm}; revalidates `/clients` only
 * on success and returns the mutation state unchanged.
 */
export async function unarchiveClientAction(
  previousState: ClientMutationState,
  formData: FormData
): Promise<ClientMutationState> {
  void previousState;
  const repository = getApplicationClientRepository();
  const result = unarchiveClientFromForm(repository, formData);
  if (result.status === "success") {
    revalidatePath("/clients");
  }
  return result;
}
