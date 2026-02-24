import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime',
  'application/pdf',
]);

/**
 * Register file upload endpoints for the chat UI.
 * POST /chat/upload — Upload a file (multipart/form-data)
 * GET /chat/uploads/:conversationId/:fileId — Serve uploaded files
 */
export function registerChatUpload(app: FastifyInstance): void {
  if (!env.isDev) return;

  const log = logger.child({ component: 'chat-upload' });
  const uploadDir = path.resolve(env.chat.uploadDir);
  const maxSize = env.chat.maxUploadSizeMb * 1024 * 1024;

  // Ensure upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    log.info({ uploadDir }, 'Created upload directory');
  }

  // POST /chat/upload
  app.post('/chat/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await (req as any).file();
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' });
      }

      const { filename, mimetype, file } = data;
      const conversationId = (data.fields?.conversation_id as any)?.value || 'unknown';

      // Validate mime type
      if (!ALLOWED_MIME_TYPES.has(mimetype)) {
        return reply.status(400).send({ error: 'File type not allowed. Accepted: images, videos, PDF' });
      }

      // Read file into buffer
      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of file) {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          return reply.status(413).send({ error: `File too large. Max: ${env.chat.maxUploadSizeMb}MB` });
        }
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Create directory structure
      const convDir = path.join(uploadDir, conversationId);
      if (!fs.existsSync(convDir)) {
        fs.mkdirSync(convDir, { recursive: true });
      }

      // Save file
      const fileId = randomUUID();
      const ext = path.extname(filename) || '';
      const storedFilename = `${fileId}${ext}`;
      const filePath = path.join(convDir, storedFilename);
      fs.writeFileSync(filePath, buffer);

      const url = `/chat/uploads/${conversationId}/${storedFilename}`;

      log.info({ fileId, filename, mimetype, size: buffer.length, conversationId }, 'File uploaded');

      return reply.status(200).send({
        fileId,
        url,
        filename,
        mimeType: mimetype,
        size: buffer.length,
      });
    } catch (err) {
      log.error({ err }, 'Upload failed');
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  // GET /chat/uploads/:conversationId/:fileId — Serve files
  app.get('/chat/uploads/:conversationId/:fileId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId, fileId } = req.params as { conversationId: string; fileId: string };

    // Sanitize path components
    const safeCid = conversationId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_.-]/g, '');
    const filePath = path.join(uploadDir, safeCid, safeFileId);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const ext = path.extname(safeFileId).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(filePath);
    return reply.header('Content-Type', contentType).send(stream);
  });

  logger.info('Chat upload routes registered: POST /chat/upload, GET /chat/uploads/:cid/:fid');
}
