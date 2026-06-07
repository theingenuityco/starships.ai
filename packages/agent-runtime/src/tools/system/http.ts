import { z } from 'zod';
import { clip, hostOf, isBlockedHost } from '../shared';
import type { SystemTool } from './tool';

export const httpFetchTool: SystemTool = {
  name: 'http_fetch',
  description: 'Fetch a URL (GET) and return the status and response body.',
  schema: z.object({ url: z.string().url().describe('Absolute URL to fetch.') }),
  // Gated under allowlist mode: it can reach the network, so it needs approval like bash.
  sensitive: true,
  capabilities: ['network'],
  run: async (input, ctx) => {
    const { url } = input as { url: string };
    // Block SSRF to loopback / private / link-local destinations (approval server, routers,
    // cloud metadata, CGNAT). Check the initial URL...
    if (isBlockedHost(hostOf(url))) {
      return 'Fetching loopback, private, or link-local addresses is not permitted.';
    }
    const res = await fetch(url, { signal: ctx.signal });
    // ...and the final URL, since fetch follows redirects and one could land on a blocked host.
    if (res.url && res.url !== url && isBlockedHost(hostOf(res.url))) {
      return 'Redirect to a loopback, private, or link-local address is not permitted.';
    }
    const body = await res.text();
    return clip(`HTTP ${res.status} ${res.statusText}\n\n${body}`);
  },
};
