import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';

const JWT_SECRET = process.env.JWT_SECRET as string;

export async function AuthRouter(server: FastifyInstance) {

    // POST /api/auth/register
    server.post('/register', async (request, reply) => {
        try {
            const { email, password, name } = request.body as any;

            if (!email || !password || !name) {
                return reply.status(400).send({ error: 'Email, password, and name are required' });
            }

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return reply.status(409).send({ error: 'Email already in use' });
            }

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            const user = await prisma.user.create({
                data: {
                    email,
                    passwordHash,
                    name
                }
            });

            // Generate Token
            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

            return reply.status(201).send({
                user: { id: user.id, email: user.email, name: user.name },
                token
            });

        } catch (error) {
            logger.error('Registration error:', error);
            return reply.status(500).send({ error: 'Failed to register user' });
        }
    });

    // POST /api/auth/login
    server.post('/login', async (request, reply) => {
        try {
            const { email, password } = request.body as any;

            if (!email || !password) {
                return reply.status(400).send({ error: 'Email and password are required' });
            }

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return reply.status(401).send({ error: 'Invalid email or password' });
            }

            const isMatch = await bcrypt.compare(password, user.passwordHash);
            if (!isMatch) {
                return reply.status(401).send({ error: 'Invalid email or password' });
            }

            // Generate Token
            const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

            return reply.send({
                user: { id: user.id, email: user.email, name: user.name },
                token
            });

        } catch (error) {
            logger.error('Login error:', error);
            return reply.status(500).send({ error: 'Failed to login' });
        }
    });

    // GET /api/auth/me (Get current user by token)
    server.get('/me', async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, name: true }
            });

            if (!user) {
                return reply.status(401).send({ error: 'User no longer exists' });
            }

            return reply.send({ user });

        } catch (error) {
            return reply.status(401).send({ error: 'Invalid or expired token' });
        }
    });
}
