import { NextRequest, NextResponse } from 'next/server';
import {
  getRoomFromStore,
  joinRoomInStore,
  mutateRoomInStore,
} from '@/lib/room-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const room = getRoomFromStore(code);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  return NextResponse.json({ room });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'join') {
      const room = joinRoomInStore({
        code,
        memberId: String(body.memberId || `user-${Date.now()}`),
        name: String(body.name || 'Player'),
        avatar: String(body.avatar || '🐼'),
      });
      if (!room) {
        return NextResponse.json({ error: 'Room not found' }, { status: 404 });
      }
      return NextResponse.json({ room });
    }

    const updated = mutateRoomInStore(code, action, body);
    if (!updated) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    return NextResponse.json({ room: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Room action failed' },
      { status: 500 }
    );
  }
}
