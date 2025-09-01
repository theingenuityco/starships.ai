# Google Analytics 4 (GA4) Setup Guide

This guide explains how to set up and use Google Analytics 4 in the Starships application.

## Setup Steps

### 1. Create a Google Analytics Account (First Time Users)

If you don't have a Google Analytics account yet:

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click **Start measuring** or **Get started today**
3. Sign in with your Google account (or create one if needed)
4. Click **Start measuring** button
5. **Account setup:**
   - Account name: Your company/organization name (e.g., "Starships AI")
   - Account Data Sharing Settings: Leave defaults or adjust as needed
   - Click **Next**
6. **Property setup:**
   - Property name: "Starships AI Web" (or your preferred name)
   - Reporting time zone: Select your time zone
   - Currency: Select your preferred currency
   - Click **Next**
7. **Business information:**
   - Industry category: Select "Technology" or appropriate category
   - Business size: Select appropriate size
   - How you intend to use Google Analytics: Select relevant options
   - Click **Create**
8. **Accept Terms:**
   - Select your country
   - Review and accept the Google Analytics Terms of Service
   - Review and accept the Data Processing Terms
   - Click **I Accept**

### 2. Set Up Your Web Data Stream

After creating your account, you'll be prompted to set up a data stream:

1. Choose **Web** as your platform
2. **Configure your web stream:**
   - Website URL: Enter your domain (e.g., `https://starships.ai` or `http://localhost:3000` for development)
   - Stream name: "Starships Web App" or similar
   - Enhanced measurement: Leave ON (recommended)
   - Click **Create stream**
3. **Your Measurement ID will appear:**
   - Look for "Measurement ID" at the top of the page
   - It will be in format: `G-XXXXXXXXXX`
   - Click the copy icon to copy it

### 3. If You Already Have a Google Analytics Account

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click on **Admin** (gear icon) in the bottom left
3. In the **Property** column, click **Create Property**
4. Follow steps 6-8 from the "First Time Users" section above
5. Then follow the "Set Up Your Web Data Stream" section

### 4. Configure Environment Variables

Add your Measurement ID to your `.env` file:

```bash
# Google Analytics Configuration
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Replace `G-XXXXXXXXXX` with your actual Measurement ID from step 1.

### 5. Verify Installation

1. Start your development server:
   ```bash
   pnpm dev
   ```

2. Open Google Analytics and navigate to:
   **Configure** → **DebugView**

3. Visit your application in the browser

4. You should see events appearing in the DebugView in real-time

## Tracking Events

### Automatic Events
Google Analytics 4 automatically tracks:
- **Page views** - When users navigate between pages
- **Session start** - When users first visit the site
- **User engagement** - Time spent on pages
- **Scroll** - When users scroll to 90% of the page
- **Outbound clicks** - Clicks on links to external domains
- **Site search** - When users search your site
- **File downloads** - When users download files

### Custom Events

You can track custom events using the `sendGAEvent` function:

```typescript
import { sendGAEvent } from '@/lib/analytics/ga-events'

function MyComponent() {
  const handleAction = () => {
    // Track a simple event
    sendGAEvent('button_click', {
      button_name: 'subscribe',
      button_location: 'pricing_page'
    })
    
    // Track with more parameters
    sendGAEvent('purchase', {
      value: 99.99,
      currency: 'USD',
      items: ['premium_plan']
    })
  }
}
```

## Testing Analytics

### Development Testing

1. Enable Debug Mode in GA4:
   - Go to **Configure** → **DebugView**
   - Events will appear in real-time

2. Use Browser Extensions:
   - Install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)
   - This will log all GA events to the browser console

### Production Verification

1. Check Real-Time Reports:
   - Go to **Reports** → **Real-time**
   - You should see active users and events

2. Check Standard Reports (after 24-48 hours):
   - **Reports** → **Engagement** → **Events**
   - **Reports** → **Engagement** → **Pages and screens**

## Privacy and Compliance

The implementation includes:

1. **IP Anonymization** - GA4 automatically anonymizes IP addresses
2. **Cookie Consent** - Consider implementing a consent banner if required by your jurisdiction
3. **Data Retention** - Default is 2 months, can be extended to 14 months in GA4 settings

## Troubleshooting

### Events Not Appearing

1. Check that the Measurement ID is correctly set in `.env`
2. Verify the environment variable is prefixed with `NEXT_PUBLIC_`
3. Check browser console for errors
4. Ensure ad blockers are disabled for testing
5. Wait a few minutes - sometimes there's a delay in DebugView

### Missing Page Views

1. Verify "Enhanced Measurement" is enabled in GA4:
   - Go to **Configure** → **Data Streams** → Your stream
   - Click **Enhanced measurement** settings
   - Ensure "Page views" is enabled

### Development vs Production

- Use different GA4 properties for development and production
- Set different Measurement IDs in your environment variables:
  ```bash
  # Development
  NEXT_PUBLIC_GA_MEASUREMENT_ID=G-DEV_ID
  
  # Production
  NEXT_PUBLIC_GA_MEASUREMENT_ID=G-PROD_ID
  ```

## Best Practices

1. **Don't track PII** - Never send personally identifiable information to GA4
2. **Use meaningful event names** - Make events descriptive and consistent
3. **Limit custom parameters** - GA4 has limits on custom dimensions
4. **Test thoroughly** - Always verify events in DebugView before deploying
5. **Document events** - Keep a record of all custom events and their parameters

## Resources

- [GA4 Documentation](https://developers.google.com/analytics/devguides/collection/ga4)
- [Next.js Analytics Guide](https://nextjs.org/docs/app/guides/analytics)
- [GA4 Event Builder](https://ga-dev-tools.google/ga4/event-builder/)
- [GA4 DebugView](https://support.google.com/analytics/answer/7201382)