import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import { Socket } from "node:net";

/** Thin infrastructure adapter for clamd's INSTREAM protocol; files never reach storage before a clean result. */
@Injectable()
export class ClamAvScanner {
  constructor(private readonly config: RuntimeConfig["malwareScanner"]) {}

  async scan(buffer: Buffer): Promise<void> {
    const response = await new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      const timeout = setTimeout(
        () => socket.destroy(new Error("scanner timeout")),
        this.config.timeoutMs,
      );
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", reject);
      socket.on("close", () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      socket.connect(this.config.port, this.config.host, () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    }).catch(() => {
      throw new ServiceUnavailableException("Malware scanning is unavailable.");
    });
    if (/\bFOUND\b/u.test(response))
      throw new UnprocessableEntityException("The uploaded file was rejected by malware scanning.");
    if (!/\bOK\b/u.test(response))
      throw new ServiceUnavailableException("Malware scanning did not return a safe result.");
  }
}
