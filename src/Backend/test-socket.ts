import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('✅ Connected to WebSocket Server! ID:', socket.id);

    const testBoardId = "test-board-999";

    // 1. Join a board
    console.log(`🔌 Joining board: ${testBoardId}...`);
    socket.emit('JOIN_BOARD', testBoardId);

    // 2. Listen for synced events from the EventBus
    socket.on('SYNC_EVENT', (event) => {
        console.log('\n📥 [RECEIVED REALTIME EVENT VIA WEBSOCKET]');
        console.log(JSON.stringify(event, null, 2));

        // Disconnect after successful test
        setTimeout(() => {
            console.log('\n👋 Disconnecting...');
            socket.disconnect();
            process.exit(0);
        }, 1000);
    });

    // 3. Send a test event after a short delay to simulate another user
    setTimeout(() => {
        console.log('\n📤 [SENDING EVENT VIA WEBSOCKET]');
        socket.emit('CANVAS_EVENT', {
            boardId: testBoardId,
            type: 'ENTITY_CREATED',
            payload: {
                entity: { id: "realtime-rect", type: "rectangle", transform: { x: 50, y: 50 } }
            }
        });
    }, 1000);
});

socket.on('connect_error', (err) => {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
});
