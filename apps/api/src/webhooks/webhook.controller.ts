import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";

import { WebhookService } from "./webhook.service.js";

interface PlainTextResponse {
  send(body: string): void;
  status(statusCode: number): PlainTextResponse;
  type(contentType: string): PlainTextResponse;
}

@Controller("webhooks/meta/whatsapp")
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  /** Meta requires the raw challenge response rather than the application's JSON envelope. */
  @Get()
  verify(
    @Query("hub.challenge") challenge: unknown,
    @Query("hub.mode") mode: unknown,
    @Query("hub.verify_token") verifyToken: unknown,
    @Res() response: PlainTextResponse,
  ): void {
    response
      .status(200)
      .type("text/plain")
      .send(this.service.verifySubscription({ challenge, mode, verifyToken }));
  }

  @Post()
  @HttpCode(200)
  receive(
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() request: RawBodyRequest<IncomingMessage>,
  ) {
    return this.service.receiveMetaEvent(request.rawBody, signature);
  }
}
