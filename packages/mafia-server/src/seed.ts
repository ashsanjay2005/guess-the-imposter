import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.eventLog.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.action.deleteMany();
  await prisma.role.deleteMany();
  await prisma.player.deleteMany();
  await prisma.room.deleteMany();

  const room = await prisma.room.create({ data: {
    code: 'SEED01', hostId: 'pending', phase: 'LOBBY', dayNumber: 0, settings: JSON.stringify({
      minPlayers: 5,
      maxPlayers: 10,
      timers: { nightSeconds: 60, dawnSeconds: 10, daySeconds: 180 },
      selfHealAllowed: true,
      mafiaMajorityRequired: true,
      spectatorsAllowed: true,
      deadChatVisibleToAlive: false,
      tiePolicy: 'NO_LYNCH',
      roles: { mafia: 2, doctor: 1, detective: 1, villager: 0 },
    }),
  }});

  const p1 = await prisma.player.create({ data: { roomId: room.id, name: 'Host', isHost: true, seat: 1, isAlive: true } });
  const p2 = await prisma.player.create({ data: { roomId: room.id, name: 'P2', seat: 2, isAlive: true } });
  const p3 = await prisma.player.create({ data: { roomId: room.id, name: 'P3', seat: 3, isAlive: true } });
  await prisma.room.update({ where: { id: room.id }, data: { hostId: p1.id } });
  console.log('Seeded room SEED01 with players:', p1.name, p2.name, p3.name);
}

main().finally(() => prisma.$disconnect());


