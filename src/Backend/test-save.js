const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const entity = {
        id: 'a52686a5-f91f-408f-8b12-f8be89b92bb6',
        type: 'STICKY_NOTE',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        props: { width: 100, height: 100, color: '#fef08a', text: 'Fixed idea' },
        metadata: { selected: true },
        visible: true
    };

    const entityData = {
        id: entity.id,
        boardId: '1d656a32-67d3-4bc1-a01e-2e27fe19f52a',
        type: entity.type,
        transform: entity.transform,
        props: entity.props,
        metadata: entity.metadata,
        visible: entity.visible,
    };

    const { id, ...updateData } = entityData;

    try {
        console.log("Upserting with updateData omitting id...");
        await prisma.entity.upsert({
            where: { id: entity.id },
            update: updateData,
            create: entityData
        });
        console.log("Success! Entity saved.");
    } catch (e) {
        console.error("Failed!", e);
    }
    process.exit(0);
}
run();
