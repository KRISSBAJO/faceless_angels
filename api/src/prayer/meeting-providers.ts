import { BadRequestException } from '@nestjs/common';

/**
 * Everything the app knows about a place to hold an online prayer session.
 * Group and session records store only a provider key, a link, and an
 * optional external reference, so a provider can gain real integration
 * later without changing those records.
 */
export interface MeetingProvider {
  key: string;
  name: string;
  /** Hosts a join link may point to. Sub-domains are allowed. */
  hosts: string[];
  /**
   * True once the app can create sessions through the provider's own API.
   * No provider does today: hosts paste a link they made themselves.
   */
  createsSessions: boolean;
}

// Order matters: the first provider is offered first.
export const PROVIDERS: MeetingProvider[] = [
  {
    key: 'patvero',
    name: 'Patvero',
    // Assumed from the product's address. Confirm the real join-link hosts
    // with Patvero before launch.
    hosts: ['patvero.com'],
    createsSessions: false,
  },
  {
    key: 'zoom',
    name: 'Zoom',
    hosts: ['zoom.us', 'zoom.com'],
    createsSessions: false,
  },
  {
    key: 'teams',
    name: 'Microsoft Teams',
    hosts: ['teams.microsoft.com', 'teams.live.com'],
    createsSessions: false,
  },
];

export const PROVIDER_KEYS = PROVIDERS.map((p) => p.key);

/**
 * Checks a join link and returns it tidied. A link that claims one provider
 * but points elsewhere is refused, so members are never sent to a look-alike.
 */
export function checkMeetingLink(
  providerKey: string | undefined | null,
  url: string | undefined | null,
): { provider: string | null; url: string | null } {
  if (!url?.trim()) return { provider: null, url: null };
  const provider = PROVIDERS.find((p) => p.key === providerKey);
  if (!provider) {
    throw new BadRequestException('Choose where the session is held.');
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new BadRequestException(
      'Enter the full join link, starting with https://',
    );
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new BadRequestException('Enter a join link that starts with https://');
  }
  const host = parsed.hostname.toLowerCase();
  if (!provider.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new BadRequestException(
      `That is not a ${provider.name} link. Check the link, or choose a different place.`,
    );
  }
  return { provider: provider.key, url: parsed.toString() };
}
