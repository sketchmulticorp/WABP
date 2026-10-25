import type {
  CampaignDraft,
  CampaignDraftInput,
  CampaignDraftOptions,
  CampaignVariable,
} from "@whatsapp-platform/contracts";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { campaignApi } from "./campaign-api";
import { MessagePreview } from "./message-preview";
import { templatePlaceholders } from "./template-placeholders";

const STEPS = ["Template", "Recipients", "Personalization", "Schedule", "Review"];

interface VariableRow {
  key: string;
  source: "LITERAL" | "CONTACT_FIELD";
  value: string;
  field: "name" | "email" | "phone_e164";
}

/** Keeps incomplete drafts editable; preflight, not this form, validates recipient values. */
export function CampaignDraftEditor({
  existing,
  options,
  saving,
  onSave,
  onClose,
  canReadContacts,
  canPreview,
  onDirtyChange,
}: {
  readonly existing: CampaignDraft | null;
  readonly options: CampaignDraftOptions;
  readonly saving: boolean;
  readonly onSave: (input: CampaignDraftInput) => void;
  readonly onClose: () => void;
  readonly canReadContacts: boolean;
  readonly canPreview: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
}) {
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState(existing?.name ?? "");
  const [scheduled, setScheduled] = useState(!!existing?.scheduleAt);
  const [scheduleEdited, setScheduleEdited] = useState(false);
  const [utcTime, setUtcTime] = useState(
    existing?.scheduleAt ? new Date(existing.scheduleAt).toISOString().slice(0, 16) : "",
  );
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  const scheduleAt = !scheduled
    ? null
    : !scheduleEdited
      ? (existing?.scheduleAt ?? null)
      : utcTime
        ? `${utcTime}:00Z`
        : null;
  const scheduleTimezone = scheduleEdited ? "UTC" : (existing?.scheduleTimezone ?? "UTC");
  const [accountId, setAccountId] = useState(existing?.whatsappAccountId ?? "");
  const [templateId, setTemplateId] = useState(existing?.templateId ?? "");
  const [contactIds, setContactIds] = useState<readonly string[]>(
    existing?.audienceDefinition.contactIds ?? [],
  );
  const [groupIds, setGroupIds] = useState<readonly string[]>(
    existing?.audienceDefinition.groupIds ?? [],
  );
  const [contactPage, setContactPage] = useState<Awaited<
    ReturnType<typeof campaignApi.contacts>
  > | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variables, setVariables] = useState<readonly VariableRow[]>(
    Object.entries(existing?.variableMapping ?? {}).map(([key, mapping]) => ({
      key,
      source: mapping.source,
      value: mapping.source === "LITERAL" ? mapping.value : "",
      field: mapping.source === "CONTACT_FIELD" ? mapping.field : "name",
    })),
  );
  async function loadContacts(cursor?: string) {
    setContactsLoading(true);
    try {
      setContactPage(await campaignApi.contacts(cursor));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Contacts could not be loaded.");
    } finally {
      setContactsLoading(false);
    }
  }
  useEffect(() => {
    if (!canReadContacts) return;
    let active = true;
    void campaignApi
      .contacts()
      .then((page) => {
        if (active) setContactPage(page);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Contacts could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [canReadContacts]);
  function updateVariable(index: number, update: Partial<VariableRow>) {
    setVariables((rows) =>
      rows.map((row, position) => (position === index ? { ...row, ...update } : row)),
    );
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const invalid = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
    ).find((field) => !field.checkValidity());
    if (invalid) {
      setStep(Number(invalid.closest<HTMLElement>("[data-wizard-step]")?.dataset.wizardStep ?? 0));
      setError(invalid.validationMessage || "Complete the highlighted fields before saving.");
      return;
    }
    if (scheduled && !scheduleAt) {
      setStep(3);
      setError("Choose a date and time in UTC.");
      return;
    }
    if (new Set(variables.map((row) => row.key.trim())).size !== variables.length) {
      setError("Each variable key must be unique.");
      return;
    }
    const fields = new FormData(event.currentTarget);
    const variableMapping: Record<string, CampaignVariable> = Object.fromEntries(
      variables.map((row) => [
        row.key.trim(),
        row.source === "LITERAL"
          ? { source: "LITERAL", value: row.value }
          : { source: "CONTACT_FIELD", field: row.field },
      ]),
    );
    onSave({
      name: formText(fields, "name"),
      description: formText(fields, "description").trim() || null,
      whatsappAccountId: accountId,
      templateId,
      audienceDefinition: { version: 1, contactIds, groupIds },
      variableMapping,
      scheduleAt,
      scheduleTimezone,
    });
  }
  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onChangeCapture={() => {
        setDirty(true);
      }}
      aria-label="Campaign draft editor"
      className="campaign-editor campaign-wizard"
    >
      <div className="campaign-heading">
        <div>
          <p className="eyebrow">Campaign draft</p>
          <h3>{existing === null ? "Create a campaign" : existing.name}</h3>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (!dirty || window.confirm("Discard your unsaved campaign changes?")) onClose();
          }}
        >
          Back to campaign
        </button>
      </div>
      <nav aria-label="Campaign steps" className="campaign-steps">
        {STEPS.map((title, index) => (
          <button
            key={title}
            type="button"
            disabled={saving}
            aria-current={step === index ? "step" : undefined}
            onClick={() => {
              setStep(index);
            }}
          >
            <span>{index + 1}</span>
            {title}
          </button>
        ))}
      </nav>
      <h3 ref={headingRef} tabIndex={-1} className="campaign-step-title">
        {STEPS[step]}
      </h3>
      {existing !== null && (
        <p>
          Material version {existing.contentVersion} · {existing.approvalStatus}. Material changes
          cancel prior approval.
        </p>
      )}
      <div className="campaign-builder-layout">
        <div>
          <fieldset disabled={saving} className="campaign-step-panel">
            <section hidden={step !== 0} data-wizard-step="0">
              <p>Give your campaign a name, then choose the sending number and message template.</p>
              <label>
                Campaign name
                <input
                  name="name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  maxLength={1000}
                  defaultValue={existing?.description ?? ""}
                />
              </label>
              <label>
                Sending account
                <select
                  required
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setTemplateId("");
                  }}
                >
                  <option value="">Select account</option>
                  {options.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayPhoneNumber ?? "WhatsApp account"} · {account.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Template
                <select
                  required
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                  }}
                >
                  <option value="">Select template</option>
                  {options.templates
                    .filter((template) => template.whatsappAccountId === accountId)
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.language}) · Meta {template.providerStatus} /
                        Internal {template.approvalStatus}
                      </option>
                    ))}
                </select>
              </label>
              <p>
                Disconnected accounts and unapproved templates can be saved in drafts; preflight
                will enforce sending eligibility.
              </p>
            </section>
            <section hidden={step !== 1} data-wizard-step="1">
              <p>
                Choose Contacts, Groups, or both. Duplicate recipients are removed during server
                checks.
              </p>
              <fieldset>
                <legend>Contacts ({contactIds.length} selected)</legend>
                {!canReadContacts && <p>Contact browsing requires contact.read permission.</p>}
                {contactsLoading && <p role="status">Loading Contacts…</p>}
                {contactPage?.contacts.length === 0 && <p>No Contacts available.</p>}
                {contactPage?.contacts.map((contact) => (
                  <label key={contact.id}>
                    <input
                      type="checkbox"
                      checked={contactIds.includes(contact.id)}
                      onChange={(event) => {
                        setContactIds(toggle(contactIds, contact.id, event.target.checked));
                      }}
                    />
                    {contact.name ?? contact.phoneE164} ({contact.phoneE164})
                  </label>
                ))}
                {canReadContacts && (
                  <>
                    <button
                      type="button"
                      disabled={contactsLoading}
                      onClick={() => void loadContacts()}
                    >
                      First Contacts page
                    </button>
                    <button
                      type="button"
                      disabled={
                        contactsLoading || contactPage?.nextCursor === null || contactPage === null
                      }
                      onClick={() => void loadContacts(contactPage?.nextCursor ?? undefined)}
                    >
                      More Contacts
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setContactIds([]);
                    setDirty(true);
                  }}
                >
                  Clear selected Contacts
                </button>
              </fieldset>
              <fieldset>
                <legend>Static Groups ({groupIds.length} selected)</legend>
                {options.groups.length === 0 && <p>No Groups available.</p>}
                {options.groups.map((group) => (
                  <label key={group.id}>
                    <input
                      type="checkbox"
                      checked={groupIds.includes(group.id)}
                      onChange={(event) => {
                        setGroupIds(toggle(groupIds, group.id, event.target.checked));
                      }}
                    />
                    {group.name}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setGroupIds([]);
                    setDirty(true);
                  }}
                >
                  Clear selected Groups
                </button>
              </fieldset>
              <p>
                Contacts and Groups are combined as a deduplicated audience during preflight. Group
                membership is not frozen by saving a draft.
              </p>
            </section>
            <section hidden={step !== 2} data-wizard-step="2">
              <fieldset>
                <legend>Personalize your message</legend>
                <p>
                  Fill each message placeholder with the same text for everyone or a Contact field.
                  Recipient checks verify the values before sending.
                </p>
                <div className="campaign-placeholder-options" aria-label="Template placeholders">
                  {templatePlaceholders(
                    options.templates.find((template) => template.id === templateId)?.components,
                  )
                    .filter((key) => !variables.some((row) => row.key === key))
                    .map((key) => (
                      <button
                        key={key}
                        type="button"
                        disabled={variables.length >= 100}
                        onClick={() => {
                          setDirty(true);
                          setVariables((rows) => [
                            ...rows,
                            { key, source: "LITERAL", value: "", field: "name" },
                          ]);
                        }}
                      >
                        Add {`{{${key}}}`}
                      </button>
                    ))}
                </div>
                {variables.map((row, index) => (
                  <div key={index} className="panel">
                    <label>
                      Variable key {index + 1}
                      <input
                        required
                        pattern="[a-zA-Z0-9_]{1,64}"
                        value={row.key}
                        onChange={(event) => {
                          updateVariable(index, { key: event.target.value });
                        }}
                      />
                    </label>
                    <label>
                      Variable source {index + 1}
                      <select
                        value={row.source}
                        onChange={(event) => {
                          updateVariable(index, {
                            source: event.target.value as VariableRow["source"],
                          });
                        }}
                      >
                        <option value="LITERAL">Same text for everyone</option>
                        <option value="CONTACT_FIELD">Personalize from Contact</option>
                      </select>
                    </label>
                    {row.source === "LITERAL" ? (
                      <label>
                        Literal value {index + 1}
                        <input
                          required
                          maxLength={4000}
                          value={row.value}
                          onChange={(event) => {
                            updateVariable(index, { value: event.target.value });
                          }}
                        />
                      </label>
                    ) : (
                      <label>
                        Contact field {index + 1}
                        <select
                          value={row.field}
                          onChange={(event) => {
                            updateVariable(index, {
                              field: event.target.value as VariableRow["field"],
                            });
                          }}
                        >
                          <option value="name">Name</option>
                          <option value="email">Email</option>
                          <option value="phone_e164">Phone (E.164)</option>
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDirty(true);
                        setVariables((rows) => rows.filter((_, position) => position !== index));
                      }}
                    >
                      Remove variable {index + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={variables.length >= 100}
                  onClick={() => {
                    setDirty(true);
                    setVariables((rows) => [
                      ...rows,
                      { key: "", source: "LITERAL", value: "", field: "name" },
                    ]);
                  }}
                >
                  Add variable
                </button>
              </fieldset>
            </section>
            <section hidden={step !== 3} data-wizard-step="3">
              <p>
                Choose when this campaign should start after the required approvals and checks.
                Saving never sends it.
              </p>
              <label>
                Delivery timing
                <select
                  value={scheduled ? "later" : "now"}
                  onChange={(event) => {
                    setScheduled(event.target.value === "later");
                    setScheduleEdited(true);
                  }}
                >
                  <option value="now">Send when authorized</option>
                  <option value="later">Schedule for later</option>
                </select>
              </label>
              {scheduled && (
                <label>
                  Date and time (UTC)
                  <input
                    type="datetime-local"
                    value={utcTime}
                    onChange={(event) => {
                      setUtcTime(event.target.value);
                      setScheduleEdited(true);
                    }}
                  />
                </label>
              )}
              <p className="campaign-help">
                The picker displays UTC, not your computer’s timezone. Edited schedules save in UTC.{" "}
                {existing?.scheduleAt && !scheduleEdited
                  ? `Existing saved timezone: ${scheduleTimezone}; unchanged schedules keep their original instant and timezone.`
                  : ""}
              </p>
            </section>
            <section hidden={step !== 4} data-wizard-step="4">
              <p>
                Review your draft. After saving, run recipient checks and obtain Admin approval
                where required.
              </p>
              <dl className="campaign-review">
                <dt>Campaign</dt>
                <dd>{name || "Not named"}</dd>
                <dt>Sending number</dt>
                <dd>
                  {options.accounts.find((account) => account.id === accountId)
                    ?.displayPhoneNumber ?? "Not selected"}
                </dd>
                <dt>Template</dt>
                <dd>
                  {options.templates.find((template) => template.id === templateId)?.name ??
                    "Not selected"}
                </dd>
                <dt>Audience selection</dt>
                <dd>
                  {contactIds.length} Contacts · {groupIds.length} Groups
                </dd>
                <dt>Timing</dt>
                <dd>
                  {scheduleAt ? `${scheduleAt} (${scheduleTimezone})` : "Send when authorized"}
                </dd>
              </dl>
              <p className="campaign-help">
                Selection counts are not eligible-recipient totals. Group membership and consent are
                checked on the server. Saving changes may require renewed approval.
              </p>
            </section>
            {error !== null && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="campaign-wizard-actions">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => {
                  setStep((value) => value - 1);
                }}
              >
                Back
              </button>
              {step < 4 && (
                <button
                  type="button"
                  onClick={() => {
                    const invalid = Array.from(
                      formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
                        `[data-wizard-step="${String(step)}"] input, [data-wizard-step="${String(step)}"] select`,
                      ) ?? [],
                    ).find((field) => !field.checkValidity());
                    if (invalid) {
                      invalid.reportValidity();
                      return;
                    }
                    if (step === 3 && scheduled && !scheduleAt) {
                      setError("Choose a date and time in UTC before continuing.");
                      return;
                    }
                    setError(null);
                    setStep((value) => value + 1);
                  }}
                >
                  Continue to {STEPS[step + 1]}
                </button>
              )}
              <button
                type="submit"
                disabled={options.accounts.length === 0 || options.templates.length === 0}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
            </div>
          </fieldset>
        </div>
        <MessagePreview
          permitted={canPreview}
          template={options.templates.find((template) => template.id === templateId)}
          variables={Object.fromEntries(
            variables.map((row) => [
              row.key.trim(),
              row.source === "LITERAL"
                ? { source: "LITERAL" as const, value: row.value }
                : { source: "CONTACT_FIELD" as const, field: row.field },
            ]),
          )}
        />
      </div>
    </form>
  );
}
function toggle(ids: readonly string[], id: string, checked: boolean): readonly string[] {
  return checked ? [...new Set([...ids, id])] : ids.filter((candidate) => candidate !== id);
}
function formText(fields: FormData, name: string): string {
  const value = fields.get(name);
  return typeof value === "string" ? value : "";
}
