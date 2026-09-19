import { ContactEntry, ContactsResponse } from "../api/types";

function ContactCard({ contact, highlight }: { contact: ContactEntry; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-accent bg-accent/5" : "border-border bg-panel"}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-100">{contact.name}</div>
        {highlight && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">This report's bureau</span>}
      </div>
      <p className="mt-0.5 text-xs text-slate-400">{contact.role}</p>
      <address className="mt-2 whitespace-pre-line text-sm not-italic text-slate-300">{contact.addressLines.join("\n")}</address>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {contact.phone && <span>{contact.phone}</span>}
        {contact.email && <span>{contact.email}</span>}
        <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Official contact page ↗
        </a>
      </div>
      {contact.note && <p className="mt-2 text-xs text-warn">{contact.note}</p>}
    </div>
  );
}

export function ContactsPanel({ contacts, reportBureau }: { contacts: ContactsResponse; reportBureau: string }) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(contacts.bureaus) as (keyof ContactsResponse["bureaus"])[]).map((key) => (
          <ContactCard key={key} contact={contacts.bureaus[key]} highlight={key === reportBureau} />
        ))}
        <ContactCard contact={contacts.court} />
        <ContactCard contact={contacts.ico} />
        <ContactCard contact={contacts.fos} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Details checked against each organisation's own site as of {new Date(contacts.lastVerified).toLocaleDateString("en-GB")}. Large
        organisations occasionally change addresses — always confirm on the linked page before posting something time-sensitive. For
        lenders/agents themselves, add their address on the relevant account page once you've confirmed it from your own paperwork.
      </p>
    </div>
  );
}
