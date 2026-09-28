import { BadRequestException, Logger } from '@nestjs/common';
import { config } from '../config';

export interface CheckedLink {
  /** The link as it will be stored and handed to members. */
  url: string;
  /** The provider's own id for the meeting, when the link carries one. */
  externalRef: string | null;
}

/**
 * Everything the app knows about a place to hold an online prayer session.
 * Group and session records store only a provider key, a link, and an
 * external reference, so a provider can gain real integration later
 * without changing those records.
 */
export interface MeetingProvider {
  key: string;
  name: string;
  /**
   * True once the app can create sessions through the provider's own API.
   * No provider does today: hosts paste a link they made themselves.
   */
  createsSessions: boolean;
  /** Checks the link's shape. Throws with a plain message when it is wrong. */
  check(url: URL): CheckedLink;
  /**
   * Asks the provider about the meeting. Returns notes for the host, or
   * throws when the provider says the meeting does not exist.
   */
  verify?(externalRef: string): Promise<string[]>;
}

const log = new Logger('MeetingProviders');

function onHost(url: URL, hosts: string[], subdomains: boolean) {
  const host = url.hostname.toLowerCase();
  return hosts.some(
    (h) => host === h || (subdomains && host.endsWith(`.${h}`)),
  );
}

function wrongPlace(name: string) {
  return new BadRequestException(
    `That is not a ${name} link. Check the link, or choose a different place.`,
  );
}

// ---- Patvero
//
// Link shapes and the public lookup come from Patvero's own code. There is
// no way yet for another app to create Patvero meetings: its meetings API
// takes a signed-in person's session, not an API key.

const PATVERO_HOSTS = ['patvero.com', 'www.patvero.com'];
const PATVERO_CODE = /^[a-z0-9_-]{4,32}$/;
const PATVERO_API = config.patvero.baseUrl;

function patveroCode(url: URL) {
  const fromPath = /^\/(?:room|video\/join)\/([^/]+)\/?$/.exec(url.pathname);
  const code = (fromPath?.[1] ?? url.searchParams.get('room') ?? '').toLowerCase();
  return PATVERO_CODE.test(code) ? code : null;
}

const patvero: MeetingProvider = {
  key: 'patvero',
  name: 'Patvero',
  createsSessions: false,

  check(url) {
    // Meetings are on the main site only. Other patvero.com hosts are not.
    if (!onHost(url, PATVERO_HOSTS, false)) throw wrongPlace('Patvero');
    if (url.searchParams.has('invite')) {
      throw new BadRequestException(
        'That is a personal invitation link, made for one person. Paste the meeting link instead. In Patvero, open the meeting and copy its link.',
      );
    }
    const code = patveroCode(url);
    if (!code) {
      throw new BadRequestException(
        'That Patvero link has no meeting code. It should look like https://www.patvero.com/?room=abc12-xyz9q',
      );
    }
    return {
      url: `https://www.patvero.com/?room=${code}`,
      externalRef: code,
    };
  },

  async verify(code) {
    let res: Response;
    try {
      res = await fetch(`${PATVERO_API}/meetings/resolve/${code}`, {
        signal: AbortSignal.timeout(4000),
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      log.warn(`Could not reach Patvero to check a meeting: ${String(err)}`);
      return [
        'We could not reach Patvero to check this meeting. Open the link yourself to make sure it works.',
      ];
    }
    if (res.status === 404) {
      throw new BadRequestException(
        'Patvero does not know this meeting. It may have ended or been cancelled. Copy the link again from Patvero.',
      );
    }
    if (!res.ok) {
      log.warn(`Patvero answered ${res.status} when checking a meeting.`);
      return [
        'Patvero could not confirm this meeting just now. Open the link yourself to make sure it works.',
      ];
    }
    const body = (await res.json().catch(() => null)) as {
      data?: {
        guestAccessMode?: string;
        waitingRoomEnabled?: boolean;
        hasPasscode?: boolean;
      };
    } | null;
    const meeting = body?.data;
    const notes: string[] = [];
    if (meeting?.guestAccessMode && meeting.guestAccessMode !== 'public_link') {
      notes.push(
        'In Patvero this meeting is not open to guests, so members without a Patvero account cannot join. To let them in, set guest access to “Anyone with the link” in the meeting’s settings.',
      );
    }
    if (meeting?.waitingRoomEnabled) {
      notes.push(
        'The waiting room is on, so you will need to admit each person.',
      );
    }
    if (meeting?.hasPasscode) {
      notes.push(
        'This meeting has a passcode. Put it in the notes for members.',
      );
    }
    return notes;
  },
};

// ---- Zoom and Teams: the link's host is checked, nothing more.

const zoom: MeetingProvider = {
  key: 'zoom',
  name: 'Zoom',
  createsSessions: false,
  check(url) {
    if (!onHost(url, ['zoom.us', 'zoom.com'], true)) throw wrongPlace('Zoom');
    return { url: url.toString(), externalRef: null };
  },
};

const teams: MeetingProvider = {
  key: 'teams',
  name: 'Microsoft Teams',
  createsSessions: false,
  check(url) {
    if (!onHost(url, ['teams.microsoft.com', 'teams.live.com'], false)) {
      throw wrongPlace('Microsoft Teams');
    }
    return { url: url.toString(), externalRef: null };
  },
};

// Order matters: the first provider is offered first.
export const PROVIDERS: MeetingProvider[] = [patvero, zoom, teams];

export const PROVIDER_KEYS = PROVIDERS.map((p) => p.key);

export interface MeetingLink {
  provider: string | null;
  url: string | null;
  externalRef: string | null;
  /** Things the host should know. Never a reason to refuse the link. */
  notes: string[];
}

/**
 * Checks a join link and returns it tidied. A link that claims one provider
 * but points elsewhere is refused, so members are never sent to a look-alike.
 */
export async function checkMeetingLink(
  providerKey: string | undefined | null,
  url: string | undefined | null,
): Promise<MeetingLink> {
  if (!url?.trim()) {
    return { provider: null, url: null, externalRef: null, notes: [] };
  }
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
  const checked = provider.check(parsed);
  const notes =
    checked.externalRef && provider.verify
      ? await provider.verify(checked.externalRef)
      : [];
  return { provider: provider.key, ...checked, notes };
}
