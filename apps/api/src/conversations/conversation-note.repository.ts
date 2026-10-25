import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ConversationNote } from "@whatsapp-platform/contracts";
import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import type { InboxPage } from "./conversation.dto.js";
import type { CreateConversationNoteInput } from "./conversation-collaboration.dto.js";

type NoteRow = { [Key in keyof ConversationNote]: ConversationNote[Key] };
const projection = sql`id,conversation_id AS "conversationId",author_id AS "authorId",note,created_at::text AS "createdAt"`;

/** Internal notes never enter the outbound Message or provider repositories. */
@Injectable()
export class ConversationNoteRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}
  async list(
    tenantId: string,
    conversationId: string,
    page: InboxPage,
  ): Promise<ConversationNote[]> {
    const result = await this.database.execute<NoteRow>(sql`
      SELECT n.id,n.conversation_id AS "conversationId",n.author_id AS "authorId",n.note,n.created_at::text AS "createdAt"
      FROM app.conversation_notes n
      JOIN app.conversations c ON c.tenant_id=n.tenant_id AND c.id=n.conversation_id
      JOIN app.contacts ct ON ct.tenant_id=c.tenant_id AND ct.id=c.contact_id AND ct.is_deleted=false
      WHERE n.tenant_id=${tenantId}::uuid AND n.conversation_id=${conversationId}::uuid
      ${page.cursor === null ? sql`` : sql`AND (n.created_at,n.id) < (${page.cursor.at}::timestamptz,${page.cursor.id}::uuid)`}
      ORDER BY n.created_at DESC,n.id DESC LIMIT ${page.limit + 1}
    `);
    return result.rows;
  }
  async create(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    authorId: string,
    input: CreateConversationNoteInput,
  ): Promise<ConversationNote | undefined> {
    const result = await tx.execute<NoteRow>(sql`
      INSERT INTO app.conversation_notes (id,tenant_id,conversation_id,author_id,note)
      VALUES (${input.id}::uuid,${tenantId}::uuid,${conversationId}::uuid,${authorId}::uuid,${input.note})
      ON CONFLICT (id) DO NOTHING RETURNING ${projection}
    `);
    return result.rows[0];
  }
  async find(
    tx: AppDatabaseTransaction,
    tenantId: string,
    conversationId: string,
    id: string,
  ): Promise<ConversationNote | undefined> {
    const result = await tx.execute<NoteRow>(sql`
      SELECT ${projection} FROM app.conversation_notes
      WHERE tenant_id=${tenantId}::uuid AND conversation_id=${conversationId}::uuid AND id=${id}::uuid
    `);
    return result.rows[0];
  }
}
