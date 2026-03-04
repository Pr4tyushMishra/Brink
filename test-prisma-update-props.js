const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    // Create dummy
    const doc = await prisma.entity.findFirst({ orderBy: { id: 'desc' } });
    console.log("Before update:", doc.props);
    
    // Perform update just like EntityRepository
    const updates = { props: { width: 999, height: 999 } }; // Partial props
    const updated = await prisma.entity.update({
        where: { id: doc.id },
        data: {
            props: updates.props !== undefined ? updates.props : doc.props,
        }
    });
    console.log("After update:", updated.props);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
