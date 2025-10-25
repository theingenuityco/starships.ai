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
                <h2 className="text-2xl font-semibold text-foreground mb-4">1. Introduction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  At Starships.ai, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this privacy policy carefully.
                </p>
                <div className="mt-4 p-4 bg-muted/20 rounded-lg">
                  <h3 className="text-lg font-medium text-foreground mb-2">Data Controller</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    INGENUITY LABS INC<br />
                    8 THE GREEN STE B<br />
                    DOVER DE 19901<br />
                    Email: <a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">tech@theingenuity.co</a>
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-2 text-sm">
                    For EU/EEA residents: If you have questions about GDPR compliance or wish to exercise your data protection rights, please contact us at the address above.
                  </p>
                </div>
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
                      <li>Account credentials (password hash, OAuth provider links including provider user ID and profile data from Google/GitHub)</li>
                      <li>Payment information: Stripe customer ID, payment session IDs, payment intent IDs, and charge IDs (card details processed and stored by Stripe, not by us)</li>
                      <li>Profile information (display name, avatar URL)</li>
                      <li>Promo code redemptions and associated reward amounts</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-medium text-foreground mb-2">Usage Information</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We automatically collect certain information about your use of the Service:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                      <li>Login timestamps (last login tracking for security)</li>
                      <li>LLM usage metrics (token counts, model used, costs)</li>
                      <li>Agent and tool usage statistics (creation, deployment, public sharing)</li>
                      <li>Conversation activity (message counts, timestamps)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xl font-medium text-foreground mb-2">Content and Workflow Data</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      We store content you create through the Service, including:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
                      <li>Starships (your workspaces) and their configuration</li>
                      <li>AI agents: name, description, model settings, system prompts, state, blueprints, preview prompts</li>
                      <li>Tools: name, description, parameters, blueprints, configuration, transforms, mutations</li>
                      <li>Conversations: titles, status, state, and all messages (including user input, agent responses, tool calls)</li>
                      <li>Environment variables and API keys (encrypted at rest)</li>
                      <li>Wallet balances, top-up transactions, and usage ledger entries</li>
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
                <h2 className="text-2xl font-semibold text-foreground mb-4">3A. Legal Basis for Processing (GDPR)</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>For users in the EU/EEA/UK, we process your personal data based on the following legal grounds:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Contract Performance:</strong> Processing necessary to provide the Service (account management, agent execution, wallet transactions, usage billing)</li>
                    <li><strong>Consent:</strong> Optional analytics and non-essential features (you can withdraw consent at any time)</li>
                    <li><strong>Legitimate Interests:</strong> Fraud prevention, security monitoring, service improvements, where not overridden by your rights</li>
                    <li><strong>Legal Obligation:</strong> Compliance with tax, accounting, and legal requirements (e.g., 7-year retention of financial records)</li>
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
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>We retain different types of data for specific periods:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Account Data:</strong> While account is active until deletion</li>
                    <li><strong>Agents, Tools, Starships:</strong> While account is active until deletion</li>
                    <li><strong>Conversations & Messages:</strong> While account is active until deletion</li>
                    <li><strong>Payment Records (Stripe IDs, topups, ledger):</strong> 7 years (legal/tax requirement)</li>
                    <li><strong>Usage Metrics (tokens, costs):</strong> 7 years for billing reconciliation</li>
                    <li><strong>OAuth Authorization Codes:</strong> 5 minutes expiry</li>
                    <li><strong>Email Verification Tokens:</strong> 24 hours expiry</li>
                    <li><strong>Password Reset Tokens:</strong> 1 hour expiry</li>
                    <li><strong>Promo Code Redemptions:</strong> Permanently (for fraud prevention and accounting)</li>
                  </ul>
                  <p className="mt-4">
                    When you delete your account, your data is permanently removed from our active systems. Financial records (payment transactions, usage billing) are retained for 7 years regardless of account deletion to comply with tax and accounting regulations. Data may persist in backups for up to 90 days but will not be accessible.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">8. Your Rights and Choices</h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>You have the following rights regarding your personal data:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Right of Access:</strong> Request copies of your personal data</li>
                    <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
                    <li><strong>Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> Request deletion of your data (subject to legal retention requirements)</li>
                    <li><strong>Right to Data Portability:</strong> Export your data in machine-readable format (JSON/CSV)</li>
                    <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
                    <li><strong>Right to Object:</strong> Object to processing based on legitimate interests or for direct marketing</li>
                    <li><strong>Right to Withdraw Consent:</strong> Withdraw consent for consent-based processing at any time</li>
                    <li><strong>Right to Lodge a Complaint:</strong> File a complaint with your local data protection authority</li>
                  </ul>
                  <div className="mt-4 p-4 bg-muted/20 rounded-lg">
                    <p className="font-medium text-foreground">How to Exercise Your Rights:</p>
                    <p className="mt-2">
                      Email us at{' '}
                      <a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">
                        tech@theingenuity.co
                      </a>
                      {' '}with your request. We will respond within <strong>30 days</strong> as required by GDPR.
                    </p>
                    <p className="mt-2">
                      For account deletion, contact our support team. We are working on self-service GDPR tools for future releases.
                    </p>
                  </div>
                  <div className="mt-4">
                    <p className="font-medium text-foreground">EU/EEA Data Protection Authorities:</p>
                    <p className="mt-2">
                      If you are in the EU/EEA, you have the right to lodge a complaint with your local supervisory authority.
                      Find your authority at{' '}
                      <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        edpb.europa.eu
                      </a>
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">9. Third-Party Services</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our Service may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">10. Children&apos;s Privacy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe we have collected information from your child, please contact us.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">11. International Data Transfers</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    Your information may be transferred to and processed in countries other than your own, including the United States and other regions where our service providers operate.
                  </p>
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Safeguards for International Transfers:</h3>
                    <ul className="list-disc pl-6 space-y-2">
                      <li><strong>Standard Contractual Clauses (SCCs):</strong> We use EU-approved SCCs for transfers to third countries</li>
                      <li><strong>Adequacy Decisions:</strong> We transfer data to countries recognized by the EU as providing adequate protection</li>
                      <li><strong>Data Processing Agreements:</strong> All service providers must agree to GDPR-compliant data processing terms</li>
                      <li><strong>Security Measures:</strong> Encryption in transit and at rest for all cross-border transfers</li>
                    </ul>
                  </div>
                  <p className="mt-4">
                    For EU/EEA users, you can request a copy of the safeguards we use for international transfers by contacting{' '}
                    <a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">
                      tech@theingenuity.co
                    </a>
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">12. Automated Decision-Making and AI Processing</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    Our Service enables you to create and run AI agents. We want to clarify how automated decision-making applies:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Your AI Agents:</strong> Decisions made by agents you create are under your control. You are responsible for their configuration and outputs.</li>
                    <li><strong>Platform Operations:</strong> We may use automated systems for fraud detection, spam prevention, and service optimization. These do not make legal or significant decisions about you.</li>
                    <li><strong>No Profiling:</strong> We do not use automated processing to create profiles that produce legal effects or significantly affect you without human review.</li>
                  </ul>
                  <p className="mt-4">
                    If automated processing significantly affects you, you have the right to human review, to express your point of view, and to contest the decision.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">13. Data Breach Notification</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    In the event of a data breach that poses a risk to your rights and freedoms, we will:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Notify the relevant supervisory authority within 72 hours (GDPR requirement)</li>
                    <li>Notify affected users without undue delay via email</li>
                    <li>Provide clear information about the breach, affected data, and steps we&apos;re taking</li>
                    <li>Recommend actions you can take to protect yourself</li>
                  </ul>
                  <p className="mt-4">
                    We maintain incident response procedures and conduct regular security audits to minimize breach risks.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">14. Shared Agents and Public Marketplace</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    When you share agent templates or tool templates publicly via our marketplace:
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Public Templates:</strong> Templates marked as public include name, description, category, tags, system prompt, model settings, blueprints, and preview prompts. Do not include personal or sensitive data in public templates.</li>
                    <li><strong>Usage Statistics:</strong> We track usage_count (how many times a template is used) for marketplace ranking and analytics.</li>
                    <li><strong>Template Relationships:</strong> We store which tool templates are assigned to which agent templates.</li>
                    <li><strong>Your Credentials Are Protected:</strong> Environment variables, API keys, and private tool configurations are NEVER included in public templates, even if you share an agent/tool publicly.</li>
                    <li><strong>User-Created Instances:</strong> When you deploy an agent or tool from a template, your instance (with your personal configurations) remains private and is not shared.</li>
                  </ul>
                  <p className="mt-4">
                    You can change a template from public to private at any time. However, users who already created instances from your template will retain their copies.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">15. Changes to This Privacy Policy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. We encourage you to review this Privacy Policy periodically.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">16. Contact Us</h2>
                <div className="space-y-3 text-muted-foreground leading-relaxed">
                  <p>
                    If you have any questions about this Privacy Policy or wish to exercise your data protection rights, please contact us:
                  </p>
                  <div className="p-4 bg-muted/20 rounded-lg">
                    <p><strong>INGENUITY LABS INC</strong></p>
                    <p>8 THE GREEN STE B</p>
                    <p>DOVER DE 19901</p>
                    <p className="mt-3"><strong>Email:</strong></p>
                    <p><a href="mailto:tech@theingenuity.co" className="text-primary hover:underline">tech@theingenuity.co</a></p>
                  </div>
                  <p className="mt-4">
                    We will respond to privacy requests within 30 days as required by GDPR.
                  </p>
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
