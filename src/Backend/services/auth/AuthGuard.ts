import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            request.log.warn('Unauthorized request attempt - No Bearer token');
            return reply.status(401).send({ error: 'Unauthorized: Missing or invalid token' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

        // Attach userId to the request payload so subsequent route handlers can access it!
        // We cast as any to bypass TS complaining about custom properties on FastifyRequest
        (request as any).userId = decoded.userId;

    } catch (error) {
        request.log.error(error, 'AuthGuard Error');
        return reply.status(401).send({ error: 'Unauthorized: Invalid token' });
    }
}
