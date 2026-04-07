/**
 * Automate My Startup - Domain Types
 *
 * Types for the public onboarding flow that collects company context,
 * AI-generates ICP profiles, and previews matching accounts before signup.
 */

export interface IcpProfile {
  id: string
  name: string
  description: string
  traits: {
    industry: string
    roles: string[]
    companySize: string
    geography: string
  }
  estimatedAccountCount: number
}

export interface IcpAccountPreview {
  company: string
  role: string
  industry: string
  size: string
  location: string
}

export type SuggestIcpsRequest = {
  companyName: string
  websiteUrl?: string
  bio: string
}

export type SuggestIcpsResponse = {
  profiles: IcpProfile[]
}

export type PreviewAccountsRequest = {
  companyName: string
  icp: IcpProfile
}

export type PreviewAccountsResponse = {
  accounts: IcpAccountPreview[]
}
