import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { ApiSuccessEnvelope } from "@whatsapp-platform/contracts";
import { map, type Observable } from "rxjs";

import type { RequestWithId } from "./request-id.js";

@Injectable()
export class ResponseEnvelopeInterceptor<TData> implements NestInterceptor<
  TData,
  ApiSuccessEnvelope<TData>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<TData>,
  ): Observable<ApiSuccessEnvelope<TData>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();

    return next.handle().pipe(
      map((data) => ({
        data,
        request_id: request.id,
      })),
    );
  }
}
