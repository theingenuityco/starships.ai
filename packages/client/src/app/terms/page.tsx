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
                  <p>Certain features of the Service require payment. By purchasing a subscription or credits:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>You agree to pay all fees associated with your account</li>
                    <li>All fees are non-refundable unless otherwise specified</li>
                    <li>We reserve the right to change our pricing with 30 days notice</li>
                    <li>You are responsible for all applicable taxes</li>
                  </ul>
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
                <h2 className="text-2xl font-semibold text-foreground mb-4">10. Termination</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">11. Changes to Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We reserve the right to modify these Terms at any time. We will notify users of any material changes via email or through the Service. Continued use of the Service after changes constitutes acceptance of the modified Terms.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-foreground mb-4">12. Contact Information</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you have any questions about these Terms, please contact us at{' '}
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
