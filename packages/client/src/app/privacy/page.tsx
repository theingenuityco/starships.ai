import Link from 'next/link'

// Public legal page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>

        <header className="mt-8 mb-10 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: January 2026</p>
          <p className="mt-4 text-sm text-muted-foreground">
            This Privacy Policy explains how Starships.ai (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and protects personal information in connection with your use of the
            Starships.ai platform and related services (the &quot;Service&quot;).
          </p>
        </header>

        <main className="space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground">1. Data Controller</h2>
            <p className="mt-2 text-muted-foreground">For the purposes of applicable data protection laws, the data controller responsible for your personal data is:</p>
            <address className="mt-2 not-italic text-muted-foreground">
              <div>The Ingenuity Labs Inc.</div>
              <div>8 The Green Ste B</div>
              <div>Dover, DE 19901</div>
              <div className="mt-2">
                Email:{' '}
                <a href="mailto:tech@theingenuity.co" className="underline underline-offset-2">
                  tech@theingenuity.co
                </a>
              </div>
            </address>
            <p className="mt-2 text-xs text-muted-foreground">
              For EU/EEA residents: If you have questions about GDPR compliance or wish to exercise your data protection rights, please contact us using the details above.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">2. Information We Collect</h2>
            <p className="mt-2 text-muted-foreground">
              We collect personal data that you provide directly to us, data we collect automatically when you use the Service, and data generated through your use of the platform.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Identification and contact details (such as name and email address).</li>
              <li>Account information (such as login credentials, OAuth identifiers, and basic profile information).</li>
              <li>Billing and transaction data (such as Stripe identifiers, wallet top-ups, and usage ledger entries; card details are processed and stored by our payment processor, not by us).</li>
              <li>Usage data (such as login timestamps, model usage metrics, and agent or tool activity).</li>
              <li>Content and configuration data you create in the Service (such as Starships, agents, tools, environment variables, and conversations).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">3. How We Use Personal Data</h2>
            <p className="mt-2 text-muted-foreground">We use personal data only for limited, specified purposes, including to:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Provide, operate, and maintain the Service.</li>
              <li>Process payments and maintain billing and usage records.</li>
              <li>Communicate with you about the Service, including security and technical notices.</li>
              <li>Respond to enquiries, support requests, and feedback.</li>
              <li>Monitor and improve the performance, security, and reliability of the Service.</li>
              <li>Prevent, detect, and investigate fraud, abuse, or security incidents.</li>
              <li>Comply with legal and regulatory obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">4. Legal Bases for Processing (EEA/UK)</h2>
            <p className="mt-2 text-muted-foreground">Where the EU, EEA, or UK data protection laws apply, we process your personal data on the following legal bases:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Performance of a contract, where processing is necessary to provide the Service to you.</li>
              <li>Compliance with a legal obligation, such as record-keeping and tax requirements.</li>
              <li>Legitimate interests, such as securing the Service, preventing misuse, and improving our platform, where those interests are not overridden by your rights.</li>
              <li>Consent, where required for specific optional features or communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">5. AI Training and Use of Content</h2>
            <p className="mt-2 text-muted-foreground">
              We do not use your private content, proprietary workflows, or agent configurations to train AI models. Your data remains your data. We may use aggregate, anonymized statistics derived
              from usage of the Service to improve our systems and features, provided such information does not identify you.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">6. Sharing of Personal Data</h2>
            <p className="mt-2 text-muted-foreground">We may share personal data with selected third parties, strictly as necessary to provide the Service or to comply with law, including:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Service providers such as hosting, infrastructure, and payment processors.</li>
              <li>Professional advisers (such as legal or accounting advisers) where reasonably necessary.</li>
              <li>Competent authorities, regulators, or courts where required by law or to protect our rights or the rights of others.</li>
              <li>Successors in interest in connection with a corporate transaction, such as a merger or acquisition, to the extent permitted by law.</li>
            </ul>
            <p className="mt-2 text-muted-foreground">We do not sell your personal data.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">7. Data Security</h2>
            <p className="mt-2 text-muted-foreground">
              We implement technical and organisational measures designed to protect personal data against accidental or unlawful destruction, loss, alteration, unauthorised disclosure, or access.
              These measures include encryption in transit and at rest where appropriate, access controls, and security monitoring. However, no method of transmission or storage is completely secure;
              we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">8. Data Retention</h2>
            <p className="mt-2 text-muted-foreground">
              We retain personal data for as long as necessary to fulfil the purposes described in this Privacy Policy or as required by law. For example, account data and configuration data are
              generally retained while your account is active, whereas certain billing and transaction records may be retained for up to seven (7) years for legal and accounting purposes. Data may
              remain in backup systems for a limited period.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">9. Your Rights</h2>
            <p className="mt-2 text-muted-foreground">
              Subject to applicable law, you may have certain rights in relation to your personal data, including the right to request access, rectification, erasure, restriction of processing, data
              portability, and to object to certain processing activities. Where processing is based on consent, you may withdraw your consent at any time without affecting the lawfulness of
              processing carried out before withdrawal.
            </p>
            <p className="mt-2 text-muted-foreground">
              To exercise these rights, please contact us using the details in section 1. We will respond to requests within the timeframes required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">10. International Transfers</h2>
            <p className="mt-2 text-muted-foreground">
              Personal data may be processed in countries outside your country of residence, including countries that may not provide the same level of data protection. Where required, we implement
              appropriate safeguards, such as Standard Contractual Clauses or other mechanisms recognised by applicable law, to protect personal data transferred internationally.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">11. Children&apos;s Data</h2>
            <p className="mt-2 text-muted-foreground">
              The Service is not intended for children under the age of 13, and we do not knowingly collect personal data from children under 13. If you believe that we have collected personal data
              from a child in violation of this policy, please contact us so that we can take appropriate steps.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">12. Changes to This Privacy Policy</h2>
            <p className="mt-2 text-muted-foreground">
              We may update this Privacy Policy from time to time to reflect changes in the Service, legal requirements, or our data practices. When we make material changes, we will provide
              appropriate notice, which may include updating the &quot;Last updated&quot; date at the top of this page or providing in-product or email notifications.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">13. Contact</h2>
            <p className="mt-2 text-muted-foreground">If you have any questions about this Privacy Policy or our handling of personal data, please contact:</p>
            <address className="mt-2 not-italic text-muted-foreground">
              <div>The Ingenuity Labs Inc.</div>
              <div>8 The Green Ste B</div>
              <div>Dover, DE 19901</div>
              <div className="mt-2">
                Email:{' '}
                <a href="mailto:tech@theingenuity.co" className="underline underline-offset-2">
                  tech@theingenuity.co
                </a>
              </div>
            </address>
          </section>

          <section className="pt-4 border-t border-border mt-8 text-xs text-muted-foreground">
            <p>
              For the terms governing your use of the Service, please refer to our{' '}
              <Link href="/terms" className="underline underline-offset-2">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
