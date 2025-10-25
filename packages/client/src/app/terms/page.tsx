'use client'

import { StarTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'
import { motion } from 'motion/react'
import Link from 'next/link'
import Icon from '@/components/primitives/Icon'

export default function TermsOfServicePage() {
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
              Terms of Service
            </h1>
            <p className="text-muted-foreground text-lg">
              Last updated: October 2025
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
                <h2 className="text-2xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  By accessing and using Starships.ai (&quot;Service&quot;), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these Terms of Service, please do not use our Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">2. Description of Service</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Starships.ai provides an AI automation platform that enables users to create, deploy, and monitor AI agents and workflows. The Service includes access to our web application, API, marketplace, and related tools and features.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">3. User Accounts</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>To use certain features of the Service, you must register for an account. You agree to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Provide accurate, current, and complete information during registration</li>
                    <li>Maintain and promptly update your account information</li>
                    <li>Maintain the security of your password and account</li>
                    <li>Accept all responsibility for activity that occurs under your account</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">4. Acceptable Use</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>You agree not to use the Service to:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Violate any applicable laws or regulations</li>
                    <li>Infringe upon the rights of others</li>
                    <li>Transmit malicious code, viruses, or harmful components</li>
                    <li>Attempt to gain unauthorized access to our systems or other users&apos; accounts</li>
                    <li>Interfere with or disrupt the Service or servers</li>
                    <li>Use the Service for any illegal or unauthorized purpose</li>
                    <li>Engage in activities that could harm minors</li>
                    <li>Create agents or workflows that violate ethical AI principles</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">5. Intellectual Property</h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  The Service and its original content, features, and functionality are owned by Starships.ai and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  You retain ownership of any content, agents, tools, or workflows you create using the Service. By using the Service, you grant us a license to host, store, and display your content as necessary to provide the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">6. Payment and Billing</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>Our Service operates on a prepaid wallet system:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Wallet Top-ups:</strong> You add funds to your starship wallet via Stripe payment</li>
                    <li><strong>Usage-Based Billing:</strong> Costs are deducted from your wallet balance as you use the Service (LLM API calls, compute time)</li>
                    <li><strong>Real-Time Deductions:</strong> Usage charges are deducted immediately from your wallet balance</li>
                    <li><strong>No Subscriptions:</strong> We do not operate on a subscription model - you only pay for what you use</li>
                    <li><strong>Non-Refundable:</strong> Wallet top-ups are non-refundable unless required by law</li>
                    <li><strong>Low Balance:</strong> When your wallet balance is low or zero, service functionality may be limited until you add funds</li>
                    <li><strong>Pricing Changes:</strong> We reserve the right to change usage rates with 30 days advance notice</li>
                    <li><strong>Taxes:</strong> You are responsible for all applicable taxes and payment processing fees</li>
                  </ul>
                  <p className="mt-4">
                    Your wallet balance is specific to each starship. You can view your current balance and transaction history in your starship&apos;s billing dashboard.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">7. Data Usage and AI Training</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We do not use your private data, proprietary workflows, or agent configurations to train AI models. Aggregate, anonymized usage data may be used to improve the Service. See our Privacy Policy for more details.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">8. Service Availability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We strive to maintain high availability but do not guarantee uninterrupted access to the Service. We reserve the right to modify, suspend, or discontinue any part of the Service with or without notice.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">9. Limitation of Liability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  To the maximum extent permitted by law, Starships.ai shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the Service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">10. Shared Content and Marketplace</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>When you share agents, tools, or workflows publicly or via our marketplace:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>You grant other users a license to use your shared content according to the terms you specify</li>
                    <li>You represent that you have the right to share the content and it does not infringe third-party rights</li>
                    <li>Your API credentials and sensitive data are never shared, even in public agents</li>
                    <li>We may review shared content for policy violations and remove content that violates these Terms</li>
                    <li>You remain responsible for the behavior and outputs of agents you share</li>
                  </ul>
                  <p className="mt-4">
                    Content you make public may be used by other users. You can make content private at any time, but previously downloaded versions may remain available to users who obtained them.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">11. API and Third-Party Integrations</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>Our Service allows integration with third-party APIs and services:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>You are responsible for obtaining and managing your own API credentials</li>
                    <li>You must comply with third-party service terms and usage limits</li>
                    <li>We are not responsible for third-party service availability, changes, or pricing</li>
                    <li>You are responsible for any costs incurred with third-party services</li>
                    <li>We store your API credentials encrypted but cannot guarantee absolute security</li>
                    <li>Rate limits and usage quotas may apply to API calls made through our Service</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">12. Account Termination and Data Deletion</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p><strong>Termination by You:</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>You may delete your account by contacting our support team</li>
                    <li>Upon account deletion, your data will be permanently removed from active systems (except as required by law)</li>
                    <li>Running agents will be stopped immediately upon account deletion</li>
                    <li>Financial records are retained for 7 years for legal compliance</li>
                    <li>Contact us at tech@theingenuity.co to request account deletion or data export</li>
                  </ul>
                  <p className="mt-4"><strong>Termination by Us:</strong></p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>We may suspend or terminate your account for Terms violations</li>
                    <li>We will provide notice when possible, except for serious violations</li>
                    <li>Upon termination, you lose access to all Service features</li>
                    <li>Outstanding fees remain due even after termination</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">13. Service Level and Uptime</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>While we strive for high availability:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>We do not guarantee 100% uptime or uninterrupted service</li>
                    <li>Scheduled maintenance will be announced in advance when possible</li>
                    <li>We are not liable for service interruptions due to factors beyond our control</li>
                    <li>Enterprise customers may have separate SLA agreements</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">14. Governing Law and Disputes</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these Terms or the Service shall be resolved through:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Good faith negotiation first</li>
                    <li>Mediation if negotiation fails</li>
                    <li>Arbitration or court proceedings as a last resort</li>
                  </ul>
                  <p className="mt-4">
                    For EU/EEA consumers: You retain your right to bring disputes before the courts in your country of residence.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">15. Changes to Terms</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    We reserve the right to modify these Terms at any time. Material changes will be communicated via:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Email notification to your registered address</li>
                    <li>In-app notification when you log in</li>
                    <li>Updated &quot;Last updated&quot; date at the top of this page</li>
                  </ul>
                  <p className="mt-4">
                    Continued use of the Service after changes constitutes acceptance of the modified Terms. If you do not agree with the changes, you must stop using the Service and may delete your account.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">16. Contact Information</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>If you have any questions about these Terms, please contact us:</p>
                  <div className="p-4 bg-muted/20 rounded-lg">
                    <p><strong>INGENUITY LABS INC</strong></p>
                    <p>8 THE GREEN STE B</p>
                    <p>DOVER DE 19901</p>
                    <p className="mt-3"><strong>Email:</strong></p>
                    <p><a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">tech@theingenuity.co</a></p>
                  </div>
                </div>
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
            <Link href="/privacy">
              <Button variant="outline">
                View Privacy Policy
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
