import Link from 'next/link'

// Public legal page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>

        <header className="mt-8 mb-10 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold text-foreground">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: January 2026
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Starships.ai platform and related
            services (collectively, the &quot;Service&quot;). Please read them carefully.
          </p>
        </header>

        <main className="space-y-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground">
              1. Acceptance of Terms
            </h2>
            <p className="mt-2 text-muted-foreground">
              By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms,
              you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              2. Description of Service
            </h2>
            <p className="mt-2 text-muted-foreground">
              Starships.ai provides an AI automation platform that enables users to create, deploy, and monitor AI agents
              and workflows. The Service includes access to our web application, API, marketplace, and related tools and
              features. We may modify or update the Service from time to time.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              3. User Accounts
            </h2>
            <p className="mt-2 text-muted-foreground">
              To use certain features of the Service, you must register for an account. You agree to provide accurate,
              current, and complete information during registration, to maintain and promptly update your account
              information, to maintain the security of your password and account, and to notify us immediately of any
              unauthorized use of your account. You are responsible for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              4. Acceptable Use
            </h2>
            <p className="mt-2 text-muted-foreground">
              You may use the Service only in compliance with applicable laws and these Terms. You agree that you will
              not, and will not permit any third party to: (a) violate any applicable law or regulation; (b) infringe upon
              the rights of others; (c) transmit malicious code, viruses, or harmful components; (d) attempt to gain
              unauthorized access to our systems or other users&apos; accounts; (e) interfere with or disrupt the Service or
              servers; (f) use the Service for any illegal or unauthorized purpose; or (g) create agents or workflows that
              violate ethical AI principles or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              5. Intellectual Property
            </h2>
            <p className="mt-2 text-muted-foreground">
              The Service and its original content, features, and functionality are owned by Starships.ai and are
              protected by international copyright, trademark, patent, trade secret, and other intellectual property
              laws. You retain ownership of any content, agents, tools, or workflows you create using the Service. By
              using the Service, you grant us a limited license to host, store, and display your content as necessary to
              provide and maintain the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              6. Payment and Billing
            </h2>
            <p className="mt-2 text-muted-foreground">
              The Service operates on a prepaid wallet system. You may add funds to your Starship wallet via supported
              payment methods. Usage-based fees (including, without limitation, LLM API calls and compute time) are
              deducted from your wallet balance on a real-time basis. Wallet top-ups are generally non-refundable unless
              required by applicable law. When your wallet balance is low or zero, Service functionality may be limited
              until additional funds are added. We may change pricing or usage rates by providing reasonable advance
              notice. You are responsible for all applicable taxes and payment processing fees.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              7. Data Usage and AI Training
            </h2>
            <p className="mt-2 text-muted-foreground">
              We do not use your private data, proprietary workflows, or agent configurations to train AI models.
              Aggregate, anonymized usage data may be used to operate and improve the Service. Further information on how
              we process personal data is set out in our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              8. Service Availability
            </h2>
            <p className="mt-2 text-muted-foreground">
              We aim to provide a reliable Service but do not guarantee uninterrupted or error-free operation. We may
              modify, suspend, or discontinue all or part of the Service at any time, with or without notice. We are not
              liable for any unavailability or modification of the Service, except to the extent required by applicable
              law or a separate written agreement with you.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              9. Limitation of Liability
            </h2>
            <p className="mt-2 text-muted-foreground">
              To the maximum extent permitted by law, Starships.ai will not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of profits, revenues, data, or goodwill, arising
              out of or related to your use of the Service, even if we have been advised of the possibility of such
              damages. Our aggregate liability arising out of or relating to the Service or these Terms will not exceed
              the greater of: (a) the amounts you have paid to us for use of the Service in the twelve (12) months prior
              to the event giving rise to the claim, or (b) one hundred US dollars (USD $100), unless a different amount
              is required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              10. Shared Content and Marketplace
            </h2>
            <p className="mt-2 text-muted-foreground">
              If you choose to share agents, tools, or workflows publicly or via any marketplace functionality, you grant
              other users a license to use your shared content under the terms you specify, subject to these Terms. You
              represent that you have the right to share such content and that it does not infringe any third-party
              rights. We may review shared content for policy violations and may remove content that violates these Terms
              or applicable law. You remain responsible for the behavior and outputs of agents you share.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              11. API and Third-Party Integrations
            </h2>
            <p className="mt-2 text-muted-foreground">
              The Service may interoperate with third-party APIs and services. You are responsible for obtaining and
              managing your own API credentials and for complying with the terms and policies of any third-party
              providers. We are not responsible for the availability, performance, or pricing of third-party services.
              We may store your API credentials in encrypted form but cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              12. Account Termination and Data Deletion
            </h2>
            <p className="mt-2 text-muted-foreground">
              You may request deletion of your account by contacting us. Upon account deletion, your data will be removed
              from our active systems, subject to retention required for legal, accounting, or regulatory purposes.
              Financial records may be retained for up to seven (7) years as required by law. We may suspend or terminate
              your access to the Service if you violate these Terms or if we reasonably believe your use of the Service
              may cause harm. Upon termination, you will lose access to the Service and any outstanding fees will remain
              due.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              13. Governing Law and Dispute Resolution
            </h2>
            <p className="mt-2 text-muted-foreground">
              These Terms and any dispute arising out of or in connection with them or the Service are governed by
              applicable laws, without regard to conflict of law principles. Before initiating formal proceedings, the
              parties will attempt to resolve disputes in good faith. Where permitted by law, disputes that cannot be
              resolved informally may be submitted to mediation, arbitration, or a court of competent jurisdiction. For
              EU/EEA consumers, you retain your right to bring disputes before the courts in your country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              14. Changes to These Terms
            </h2>
            <p className="mt-2 text-muted-foreground">
              We may update these Terms from time to time. When we make material changes, we will provide appropriate
              notice, which may include email communication, in-product notifications, or an updated &quot;Last updated&quot; date
              at the top of this page. Your continued use of the Service after the effective date of any changes
              constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              15. Contact Information
            </h2>
            <p className="mt-2 text-muted-foreground">
              If you have any questions about these Terms, please contact us at:
            </p>
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
              For information about how we collect, use, and protect personal data, please also review our{' '}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </main>
      </div>
    </div>
  )
}
