import { CONTACT_EMAIL } from '@/lib/site';

/** Shared layout for the privacy policy and terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-gray-300 [&_h2]:text-lg [&_h2]:text-gray-50 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1 [&_a]:text-brand-400 [&_a:hover]:underline">
      <h1 className="text-3xl font-bold text-gray-50 mb-2">{title}</h1>
      <p className="text-gray-500 mb-8">Last updated {updated}</p>
      {children}
    </article>
  );
}

/** How to reach the site owner: the CONTACT_EMAIL address, if one is set. */
export function ContactLine() {
  return CONTACT_EMAIL ? (
    <p>
      Questions or requests: email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
    </p>
  ) : (
    <p>Questions or requests: reply to any email you&apos;ve received from Scentsibility.</p>
  );
}
