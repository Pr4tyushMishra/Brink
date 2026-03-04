const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const boards = await prisma.board.findMany({ include: { entities: true } });
    console.dir(boards, { depth: null });
    process.exit(0);
}
run();
