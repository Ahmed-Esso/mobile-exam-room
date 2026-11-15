import { NextRequest, NextResponse } from 'next/server';
import { createRoomInStore, joinRoomInStore } from '@/lib/room-store';
import { GameMode } from '@/types/exam';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'create';
    const memberId = String(body.memberId || `user-${Date.now()}`);
    const name = String(body.name || 'Player').trim();
    const avatar = String(body.avatar || '🐥');
    const username = typeof body.username === 'string' ? body.username : undefined;
    const email = typeof body.email === 'string' ? body.email : undefined;
    const pictureUrl =
      typeof body.pictureUrl === 'string' ? body.pictureUrl : undefined;

    if (action === 'join') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!code || code.length < 4) {
        return NextResponse.json(
          { error: 'Please enter a valid 6-character room code.' },
          { status: 400 }
        );
      }
      const room = joinRoomInStore({
        code,
        memberId,
        name,
        avatar,
        username,
        email,
        pictureUrl,
      });
      if (!room) {
        return NextResponse.json(
          { error: `Room "${code}" was not found. Check the 6-character code!` },
          { status: 404 }
        );
      }
      return NextResponse.json({ room });
    }

    const title = typeof body.title === 'string' ? body.title : undefined;
    const mode: GameMode = body.mode === 'race' ? 'race' : 'wait';

    const room = createRoomInStore({
      memberId,
      name,
      avatar,
      username,
      email,
      pictureUrl,
      title,
      mode,
    });

    return NextResponse.json({ room });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to create or join room.',
      },
      { status: 500 }
    );
  }
}
