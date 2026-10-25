/** Explains a server-enforced deployment boundary, not a subscription or permission upgrade. */
export function PreviewNotice() {
  return (
    <aside className="whatsapp-notice" aria-label="Limited preview">
      <strong>Storage-free preview — setup, authoring and reporting</strong>
      <p>
        Existing business/account administration, platform summaries, billing records and manual
        Contacts/Groups are available to their authorized roles. Super Admin cannot access tenant
        contacts or message content. Tenant reports, WhatsApp development setup, text templates and
        campaign drafts/Admin review are available. Meta synchronization requires server
        credentials. Imports/uploads, recipient preflight, sending/scheduling, Inbox and automation
        remain disabled until their required services are enabled. Drafts and approvals do not send
        messages.
      </p>
    </aside>
  );
}
