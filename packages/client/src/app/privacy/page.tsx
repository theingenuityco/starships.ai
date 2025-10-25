'use client'

import { StarTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'
import { motion } from 'motion/react'
import Link from 'next/link'
import Icon from '@/components/primitives/Icon'

export default function PrivacyPolicyPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden">
        {/* Background overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/60 pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground mb-8 transition-colors">
              <Icon name="arrow-left" className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent mb-4">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground text-lg">
              Last updated: January 2025
            </p>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="prose prose-invert prose-lg max-w-none"
          >
            <div className="space-y-8 text-foreground/90">
              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">1. Introduction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  At Starships.ai, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this privacy policy carefully.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">2. Information We Collect</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-medium text-foreground mb-2">Personal Information</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We collect information that you provide directly to us, including:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                      <li>Name and email address</li>
                      <li>Account credentials</li>
                      <li>Payment information (processed securely through third-party providers)</li>
                      <li>Profile information</li>
                      <li>Communications with us</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-medium text-foreground mb-2">Usage Information</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We automatically collect certain information about your use of the Service:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                      <li>Log data (IP address, browser type, pages visited)</li>
                      <li>Device information</li>
                      <li>Usage patterns and preferences</li>
                      <li>Performance metrics</li>
                      <li>Error logs and diagnostics</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-medium text-foreground mb-2">Content and Workflow Data</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We store content you create through the Service, including:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                      <li>AI agents and their configurations</li>
                      <li>Tools and workflows</li>
                      <li>Conversation history</li>
                      <li>API keys and integration settings (encrypted)</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">3. How We Use Your Information</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>We use the information we collect to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide, maintain, and improve our Service</li>
                    <li>Process transactions and send related information</li>
                    <li>Send technical notices, updates, and security alerts</li>
                    <li>Respond to your comments and questions</li>
                    <li>Monitor and analyze trends, usage, and activities</li>
                    <li>Detect, prevent, and address technical issues and security threats</li>
                    <li>Personalize your experience</li>
                    <li>Comply with legal obligations</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">4. AI Training and Data Usage</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p className="font-medium text-foreground">Your Data is Not Used for AI Training</p>
                  <p>
                    We do not use your private content, agent configurations, or proprietary workflows to train AI models. Your data remains your data.
                  </p>
                  <p>
                    We may use aggregate, anonymized usage statistics to improve the Service, but this data cannot be traced back to individual users.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">5. Information Sharing and Disclosure</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>We may share your information in the following circumstances:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf (e.g., payment processing, hosting)</li>
                    <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                    <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                    <li><strong>With Your Consent:</strong> When you explicitly agree to share information</li>
                  </ul>
                  <p className="mt-4">
                    We do not sell your personal information to third parties.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">6. Data Security</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We implement industry-standard security measures to protect your information, including:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                  <li>Encryption in transit (TLS/SSL) and at rest</li>
                  <li>Secure authentication (JWT tokens)</li>
                  <li>Regular security audits and monitoring</li>
                  <li>Access controls and principle of least privilege</li>
                  <li>Encrypted storage of sensitive credentials</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">7. Data Retention</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We retain your information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time. We will retain and use your information as necessary to comply with legal obligations and resolve disputes.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">8. Your Rights and Choices</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>You have the right to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Access your personal information</li>
                    <li>Correct inaccurate data</li>
                    <li>Request deletion of your data</li>
                    <li>Export your data</li>
                    <li>Opt-out of marketing communications</li>
                    <li>Object to certain processing activities</li>
                  </ul>
                  <p className="mt-4">
                    To exercise these rights, please contact us at{' '}
                    <a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">
                      tech@theingenuity.co
                    </a>
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">9. Cookies and Tracking</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We use cookies and similar tracking technologies to track activity on our Service. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">10. Third-Party Services</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our Service may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">11. Children&apos;s Privacy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe we have collected information from your child, please contact us.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">12. International Data Transfers</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">13. Changes to This Privacy Policy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this Privacy Policy periodically.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">14. Contact Us</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you have any questions about this Privacy Policy, please contact us at{' '}
                  <a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">
                    tech@theingenuity.co
                  </a>
                </p>
              </section>
            </div>
          </motion.div>

          {/* Footer actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 pt-8 border-t border-border/40 flex flex-col sm:flex-row gap-4 justify-between items-center"
          >
            <Link href="/terms">
              <Button variant="outline">
                View Terms of Service
              </Button>
            </Link>
            <Link href="/login">
              <Button>
                Get Started
                <Icon name="arrow-right" className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </StarTheme>
  )
}
