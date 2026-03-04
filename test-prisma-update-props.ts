import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const doc = await prisma.entity.findFirst({ orderBy: { id: 'desc' } });
    console.log("Before update:", doc?.props);
    if(doc) {
        const updates = { props: { width: 999, height: 999 } };
        const combinedProps = { ...(doc.props as any), ...updates.props };
        const updated = await prisma.entity.update({
            where: { id: doc.id },
            data: { props: combinedProps }
        });
        console.log("After update:", updated.props);
    }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
