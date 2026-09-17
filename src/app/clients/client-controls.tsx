"use client";

/**
 * Production Batch 2D2A — reusable client mutation controls.
 *
 * - `CreateClientForm`: adds a new client via `createClientAction`,
 *   surfacing server-side validation errors per field (noValidate).
 * - `ClientArchiveControl`: archives/restores one client via
 *   `archiveClientAction` / `unarchiveClientAction` (useActionState is
 *   called exactly once; the action is selected per render).
 *
 * Both components are read/submit-only clients of the server actions:
 * no raw HTML injection, no server-managed fields (id, created_at,
 * updated_at, archived_at), and no permanent-delete control.
 */
import { useActionState, useEffect, useRef } from "react";
import {
  archiveClientAction,
  createClientAction,
  unarchiveClientAction,
} from "./actions";
import {
  initialClientMutationState,
  type ClientMutationState,
} from "@/lib/clients/mutations";
import styles from "./clients.module.css";

function fieldErrorId(name: string): string {
  return `client-field-error-${name}`;
}

function fieldErrorsFor(name: string, state: ClientMutationState): string[] {
  return state.fieldErrors[name] ?? [];
}

function FieldError({
  name,
  state,
  className,
}: {
  name: string;
  state: ClientMutationState;
  className: string;
}) {
  const errors = fieldErrorsFor(name, state);
  if (errors.length === 0) {
    return null;
  }
  return (
    <p id={fieldErrorId(name)} role="alert" className={className}>
      {errors.join(" ")}
    </p>
  );
}

/**
 * Accessible form-level status message.
 * The live region is always rendered so assistive technology announces
 * changes; content is only shown once a message exists.
 */
function FormMessage({
  state,
  className,
}: {
  state: ClientMutationState;
  className: string;
}) {
  const hasMessage =
    state.status !== "idle" && state.message.trim().length > 0;
  return (
    <p
      className={className}
      role={state.status === "error" ? "alert" : "status"}
      aria-live={state.status === "error" ? "assertive" : "polite"}
      data-status={hasMessage ? state.status : undefined}
    >
      {hasMessage ? state.message : ""}
    </p>
  );
}

export function CreateClientForm() {
  const [state, formAction, pending] = useActionState(
    createClientAction,
    initialClientMutationState,
  );

  const formRef = useRef<HTMLFormElement | null>(null);
  const resetClientIdRef = useRef<string | null>(null);

  // After a new successful client ID appears, reset the form exactly once.
  useEffect(() => {
    if (
      state.status === "success" &&
      state.clientId !== undefined &&
      resetClientIdRef.current !== state.clientId
    ) {
      resetClientIdRef.current = state.clientId;
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} noValidate className={styles.createPanel}>
      <header className={styles.createHeading}>
        <h3 className={styles.createTitle}>Add a client</h3>
        <p className={styles.createDescription}>
          Record who you film for, how to reach them, and where they are
          based. Only the name is required.
        </p>
      </header>

      <div className={styles.formGrid}>
        <div className={styles.fieldSpan}>
          <label className={styles.fieldLabel} htmlFor="client-name">
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="client-name"
            name="name"
            type="text"
            required
            maxLength={200}
            autoComplete="organization"
            aria-invalid={fieldErrorsFor("name", state).length > 0}
            aria-describedby={
              fieldErrorsFor("name", state).length > 0
                ? fieldErrorId("name")
                : undefined
            }
            className={styles.fieldInput}
          />
          <FieldError
            name="name"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-kind">
            Kind
          </label>
          <select
            id="client-kind"
            name="kind"
            defaultValue="organization"
            aria-invalid={fieldErrorsFor("kind", state).length > 0}
            aria-describedby={
              fieldErrorsFor("kind", state).length > 0
                ? fieldErrorId("kind")
                : undefined
            }
            className={styles.fieldInput}
          >
            <option value="organization">Organization</option>
            <option value="person">Person</option>
          </select>
          <FieldError
            name="kind"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-contact">
            Preferred contact name
          </label>
          <input
            id="client-contact"
            name="preferred_contact_name"
            type="text"
            maxLength={200}
            autoComplete="off"
            aria-invalid={
              fieldErrorsFor("preferred_contact_name", state).length > 0
            }
            aria-describedby={
              fieldErrorsFor("preferred_contact_name", state).length > 0
                ? fieldErrorId("preferred_contact_name")
                : undefined
            }
            className={styles.fieldInput}
          />
          <FieldError
            name="preferred_contact_name"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-email">
            Email
          </label>
          <input
            id="client-email"
            name="email"
            type="email"
            autoComplete="off"
            aria-invalid={fieldErrorsFor("email", state).length > 0}
            aria-describedby={
              fieldErrorsFor("email", state).length > 0
                ? fieldErrorId("email")
                : undefined
            }
            className={styles.fieldInput}
          />
          <FieldError
            name="email"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-phone">
            Phone
          </label>
          <input
            id="client-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="+33612345678"
            autoComplete="off"
            aria-invalid={fieldErrorsFor("phone", state).length > 0}
            aria-describedby={
              fieldErrorsFor("phone", state).length > 0
                ? "client-phone-hint " + fieldErrorId("phone")
                : "client-phone-hint"
            }
            className={styles.fieldInput}
          />
          <p id="client-phone-hint" className={styles.fieldHint}>
            E.164 format, e.g. +33612345678
          </p>
          <FieldError
            name="phone"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-city">
            City
          </label>
          <input
            id="client-city"
            name="city"
            type="text"
            maxLength={100}
            autoComplete="address-level2"
            aria-invalid={fieldErrorsFor("city", state).length > 0}
            aria-describedby={
              fieldErrorsFor("city", state).length > 0
                ? fieldErrorId("city")
                : undefined
            }
            className={styles.fieldInput}
          />
          <FieldError
            name="city"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="client-country">
            Country code
          </label>
          <input
            id="client-country"
            name="country"
            type="text"
            inputMode="text"
            maxLength={2}
            minLength={2}
            placeholder="FR"
            autoComplete="country-name"
            aria-invalid={fieldErrorsFor("country", state).length > 0}
            aria-describedby={
              fieldErrorsFor("country", state).length > 0
                ? "client-country-hint " + fieldErrorId("country")
                : "client-country-hint"
            }
            className={styles.fieldInput}
          />
          <p id="client-country-hint" className={styles.fieldHint}>
            ISO-3166-1 alpha-2, e.g. FR
          </p>
          <FieldError
            name="country"
            state={state}
            className={styles.fieldError}
          />
        </div>

        <div className={styles.fieldSpan}>
          <label className={styles.fieldLabel} htmlFor="client-notes">
            Notes
          </label>
          <textarea
            id="client-notes"
            name="notes"
            rows={4}
            maxLength={5000}
            aria-invalid={fieldErrorsFor("notes", state).length > 0}
            aria-describedby={
              fieldErrorsFor("notes", state).length > 0
                ? fieldErrorId("notes")
                : undefined
            }
            className={styles.fieldTextarea}
          />
          <FieldError
            name="notes"
            state={state}
            className={styles.fieldError}
          />
        </div>
      </div>

      <FormMessage state={state} className={styles.formMessage} />

      <div className={styles.formActions}>
        <button
          type="submit"
          disabled={pending}
          className={styles.primaryButton}
        >
          {pending ? "Adding client…" : "Add client"}
        </button>
      </div>
    </form>
  );
}

export function ClientArchiveControl({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}) {
  // useActionState is called exactly once; the action itself is selected
  // per render based on the current archive state.
  const [state, formAction, pending] = useActionState(
    archived ? unarchiveClientAction : archiveClientAction,
    initialClientMutationState,
  );

  const hasError = state.status === "error";

  return (
    <form action={formAction} noValidate className={styles.archiveForm}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className={
          archived ? styles.restoreButton : styles.archiveButton
        }
      >
        {pending
          ? archived
            ? "Restoring…"
            : "Archiving…"
          : archived
            ? "Restore"
            : "Archive"}
      </button>
      <p
        className={styles.archiveMessage}
        role="status"
        aria-live="polite"
        data-status={hasError ? "error" : state.status !== "idle" ? "success" : undefined}
      >
        {state.status !== "idle" ? state.message : ""}
      </p>
    </form>
  );
}
