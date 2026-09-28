import { Injectable } from '@nestjs/common';
import { Queryable } from '../db/db.service';

export interface AuditEvent {
  actorId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  /** For things identified by a text key, like a need type. */
  objectKey?: string | null;
  priorState?: string | null;
  newState?: string | null;
  reason?: string | null;
}

@Injectable()
export class AuditService {
  // Takes the caller's client so the event commits or rolls back with the change it describes.
  async record(client: Queryable, event: AuditEvent) {
    await client.query(
      `insert into audit_events
         (actor_id, action, object_type, object_id, object_key, prior_state,
          new_state, reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.actorId,
        event.action,
        event.objectType,
        event.objectId ?? null,
        event.objectKey ?? null,
        event.priorState ?? null,
        event.newState ?? null,
        event.reason ?? null,
      ],
    );
  }
}
