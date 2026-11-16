import { NextRequest, NextResponse } from 'next/server';
import {
  computeQuestionsDigest,
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
    const action = String(body.action || 'sync');

    if (action === 'join') {
      const room = joinRoomInStore({
        code,
        memberId: String(body.memberId || `user-${Date.now()}`),
        name: String(body.name || 'Player'),
        avatar: String(body.avatar || '🐥'),
        username: typeof body.username === 'string' ? body.username : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        pictureUrl:
          typeof body.pictureUrl === 'string' ? body.pictureUrl : undefined,
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

    // Optimize sync payload size: omit heavy questions[] when client already holds the matching digest
    const serverDigest =
      updated.questionsDigest || computeQuestionsDigest(updated.questions);
    const knownDigest =
      typeof body.knownQuestionsDigest === 'string'
        ? body.knownQuestionsDigest
        : '';
    const includeQuestions = Boolean(body.includeQuestions);

    if (
      action === 'sync' &&
      !includeQuestions &&
      knownDigest &&
      knownDigest === serverDigest &&
      updated.questions.length > 0
    ) {
      return NextResponse.json({
        room: {
          ...updated,
          questionsDigest: serverDigest,
          questions: [],
        },
        questionsOmitted: true,
      });
    }

    return NextResponse.json({
      room: {
        ...updated,
        questionsDigest: serverDigest,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Room action failed' },
      { status: 500 }
    );
  }
}
