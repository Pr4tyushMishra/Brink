const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const list = await prisma.entity.findMany({ orderBy: { id: 'desc' }, take: 2 });
    console.log(JSON.stringify(list, null, 2));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
