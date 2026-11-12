from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import get_settings
from app.live import LiveFeed

router = APIRouter()


@router.websocket("/ws/vehicles")
async def vehicles_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin is not None and origin not in get_settings().cors_origin_list:
        await websocket.close(code=1008)
        return
    live: LiveFeed = websocket.app.state.live
    await websocket.accept()
    client = live.connect(websocket)
    try:
        await live.send(client)
        while True:
            if live.handle(client, await websocket.receive_text()):
                await live.send(client)
    except WebSocketDisconnect:
        pass
    finally:
        live.disconnect(client)
