const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ userId: '69a52eaa13ebe70001df7972' }, 'super-secret-development-key-change-me');
const socket = io('http://localhost:3000', { auth: { token } });

socket.on('connect', () => {
    console.log("Connected to local backend socket!");

    // 1. Join Board
    socket.emit('JOIN_BOARD', '1d656a32-67d3-4bc1-a01e-2e27fe19f52a');

    // 2. Send Event
    setTimeout(() => {
        socket.emit('CANVAS_EVENT', {
            boardId: '1d656a32-67d3-4bc1-a01e-2e27fe19f52a',
            type: 'ENTITY_CREATED',
            payload: {
                entity: {
                    id: 'test-entity-123',
                    type: 'RECTANGLE',
                    transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
                    props: { width: 50, height: 50, color: '#f00' },
                    metadata: {},
                    visible: true
                }
            }
        });
        console.log("Emitted canvas event...");
    }, 500);

    setTimeout(() => {
        process.exit(0);
    }, 1500);
});
