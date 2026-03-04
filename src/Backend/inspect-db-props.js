const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const entity = await prisma.entity.findFirst({ orderBy: { type: 'desc' } }); // get any entity
    console.log("Type of props:", typeof entity.props);
    console.log("IsArray props:", Array.isArray(entity.props));
    console.log("Props content:", entity.props);
    console.log("JSON stringified props:", JSON.stringify(entity.props, null, 2));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
