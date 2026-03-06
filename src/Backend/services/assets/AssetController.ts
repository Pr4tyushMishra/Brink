import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../core/database/prisma';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authGuard } from '../auth/AuthGuard';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'images');

export const assetController: FastifyPluginAsync = async (server) => {
    // Requires authentication to upload assets
    server.addHook('preValidation', authGuard);

    server.post('/upload', async (request, reply) => {
        const data = await request.file();

        if (!data) {
            return reply.status(400).send({ error: 'No file uploaded' });
        }

        // Validate MIME type
        if (!data.mimetype.startsWith('image/')) {
            return reply.status(400).send({ error: 'Only images are allowed' });
        }

        // Generate unique filename
        const ext = path.extname(data.filename) || '.png';
        const uniqueId = uuidv4();
        const filename = `${uniqueId}${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        // Ensure directory exists (already done via mkdir -p, but good practice)
        await fs.mkdir(UPLOADS_DIR, { recursive: true });

        // Save file buffer to disk
        const buffer = await data.toBuffer();
        await fs.writeFile(filePath, buffer);

        const assetUrl = `/uploads/images/${filename}`;
        const userId = (request as any).userId; // From authGuard

        // Store metadata in MongoDB
        const asset = await prisma.asset.create({
            data: {
                id: uniqueId,
                filename: data.filename,
                path: assetUrl,
                mimeType: data.mimetype,
                size: buffer.length,
                uploadedBy: userId
            }
        });

        return reply.status(200).send({
            assetId: asset.id,
            url: asset.path
        });
    });
};
