import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const boardId = 'ba861486-267f-4a94-8d02-4ea009630bad'; // User's board
    const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { entities: true }
    });
    console.log("Entities for specific board:\n", JSON.stringify(board?.entities, null, 2));
    
    // Just grab any entity if they didn't draw on that specific board
    const anyEntity = await prisma.entity.findFirst();
    console.log("Any Entity raw format:\n", JSON.stringify(anyEntity, null, 2));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
