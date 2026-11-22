/**
 * Dự án demo đầy đủ vai trò để xem nhanh app. Chạy lại được (xoá dự án demo cũ rồi tạo lại).
 *   npx ts-node prisma/seed-demo.ts
 * Mật khẩu chung: Demo@123. Ảnh/evidence không có (Drive giả) — muốn upload ảnh thật thì
 * chủ nhà kết nối Google Drive thật trong Hồ sơ.
 */
import { PhaseStatus, PrismaClient, StepStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { computeSchedule } from '../src/scheduling/cpm';

const prisma = new PrismaClient();
const PASSWORD = 'Demo@123';
const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10));
const daysAgo = (n: number, h = 9) => new Date(today.getTime() - n * DAY + (h - 7) * 3_600_000);
const code = () => Array.from({ length: 8 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');

const USERS = {
  owner: { email: 'chunha.demo@homee.vn', name: 'Anh Minh (Chủ nhà)' },
  main: { email: 'thauchinh.demo@homee.vn', name: 'Cty Xây dựng Hưng Phát' },
  sub: { email: 'thauphu.demo@homee.vn', name: 'Đội thợ chú Tư' },
  sup: { email: 'giamsat.demo@homee.vn', name: 'KS Lan (Giám sát)' },
};

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const u: Record<keyof typeof USERS, string> = {} as never;
  for (const [k, v] of Object.entries(USERS) as [keyof typeof USERS, (typeof USERS)['owner']][]) {
    const user = await prisma.user.upsert({
      where: { email: v.email },
      update: { passwordHash, name: v.name },
      create: { email: v.email, name: v.name, passwordHash, referralCode: code() },
    });
    u[k] = user.id;
  }

  // Xoá dự án demo cũ (cascade toàn bộ dữ liệu con).
  await prisma.project.deleteMany({ where: { members: { some: { userId: u.owner, role: 'OWNER' } } } });
  await prisma.notification.deleteMany({ where: { userId: { in: Object.values(u) } } });

  const drive = await prisma.googleDriveAccount.upsert({
    where: { userId_googleUserId: { userId: u.owner, googleUserId: 'demo' } },
    update: {},
    create: { userId: u.owner, googleUserId: 'demo', email: USERS.owner.email, refreshTokenEncrypted: 'demo' },
  });

  const template = await prisma.processTemplate.findFirst({
    where: { name: 'Quy trình thi công + giám sát tích hợp' },
    include: { phases: { include: { steps: true }, orderBy: { order: 'asc' } } },
  });
  if (!template) throw new Error('Chưa có template — chạy prisma/seed.ts trước');

  const start = daysAgo(24, 7);
  const project = await prisma.project.create({
    data: {
      name: 'Nhà phố 3 tầng — Q.7 (DEMO)',
      address: '12 Nguyễn Thị Thập, Tân Phú, Quận 7, TP.HCM',
      floors: '3 tầng + tum',
      buildingType: 'Nhà phố',
      status: 'ACTIVE',
      contractType: 'TRON_GOI_A_Z',
      templateId: template.id,
      driveAccountId: drive.id,
      billingOwnerId: u.owner,
      constructionStartDate: start,
      expectedStartDate: start,
      expectedEndDate: new Date(start.getTime() + 180 * DAY),
      materialCheck: { create: { status: 'APPROVED', submittedAt: daysAgo(27), decidedAt: daysAgo(26), decidedById: u.owner } },
      members: {
        create: [
          { userId: u.owner, role: 'OWNER' },
          { userId: u.main, role: 'MAIN_CONTRACTOR' },
          {
            userId: u.sub,
            role: 'SUB_CONTRACTOR',
            teamType: 'PHAN_THO',
            teamWorkers: { create: ['Tư', 'Hải', 'Lộc', 'Bình', 'Nam'].map((name) => ({ name })) },
          },
          { userId: u.sup, role: 'SUPERVISOR' },
        ],
      },
      phases: {
        create: template.phases
          .filter((p) => p.scope !== 'THAO_DO')
          .map((p) => ({
            code: p.code,
            order: p.order,
            name: p.name,
            plannedDurationDays: p.defaultDurationDays,
            steps: {
              create: p.steps
                .sort((a, b) => a.order - b.order)
                .map(({ order, name, acceptance, mandatory, minPhotos, requiresVideo, floorLabel }) => ({
                  order, name, acceptance, mandatory, minPhotos, requiresVideo, floorLabel,
                })),
            },
          })),
      },
    },
    include: { phases: { orderBy: { order: 'asc' }, include: { steps: { orderBy: { order: 'asc' } } } } },
  });

  // Chuỗi tuần tự + baseline (giống relinkSequentialSchedule + captureBaseline).
  const flat = project.phases.flatMap((ph) =>
    ph.steps.map((s) => ({ ...s, phaseId: ph.id, durationDays: Math.max(1, Math.round(ph.plannedDurationDays / ph.steps.length)) })),
  );
  const sched = computeSchedule(
    flat.map((s, i) => ({
      id: s.id, durationDays: s.durationDays, predecessorStepId: i ? flat[i - 1].id : null,
      predecessorRelation: 'FS', lagDays: 0, baselineStart: null, baselineEnd: null, actualStart: null, actualEnd: null,
    })),
    start,
  );

  // Trạng thái: 8 bước đầu đã duyệt, rồi 1 giám sát đã duyệt, 1 bị trả lại, 1 đang thi công.
  const APPROVED = 8;
  const statusOf = (i: number): StepStatus =>
    i < APPROVED ? 'APPROVED' : i === APPROVED ? 'SUPERVISOR_APPROVED' : i === APPROVED + 1 ? 'REJECTED' : i === APPROVED + 2 ? 'OPEN' : 'LOCKED';
  await prisma.$transaction(
    flat.map((s, i) =>
      prisma.step.update({
        where: { id: s.id },
        data: {
          durationDays: s.durationDays,
          predecessorStepId: i ? flat[i - 1].id : null,
          baselineStart: sched[i].plannedStart,
          baselineEnd: sched[i].plannedEnd,
          status: statusOf(i),
          dailyLogActive: i === APPROVED + 2,
        },
      }),
    ),
  );
  for (const ph of project.phases) {
    const idx = ph.steps.map((s) => flat.findIndex((f) => f.id === s.id));
    const status: PhaseStatus = idx.every((i) => i < APPROVED) ? 'DONE' : idx.some((i) => i <= APPROVED + 2) ? 'IN_PROGRESS' : 'LOCKED';
    await prisma.phase.update({ where: { id: ph.id }, data: { status } });
  }

  // Duyệt + báo cáo tiến độ cho các bước đã xong.
  for (let i = 0; i < APPROVED + 3; i++) {
    const s = flat[i];
    const doneDay = Math.max(1, 23 - i * 2);
    await prisma.comment.createMany({
      data: [
        { stepId: s.id, authorId: u.sub, body: `Đã thi công 50% "${s.name}".`, progressPercent: 50, createdAt: daysAgo(doneDay + 1, 16) },
        { stepId: s.id, authorId: u.sub, body: `Hoàn thành "${s.name}", mời @${USERS.sup.name} nghiệm thu.`, progressPercent: 100, createdAt: daysAgo(doneDay, 15) },
      ],
    });
    if (i <= APPROVED) {
      await prisma.approval.create({
        data: { stepId: s.id, approverId: u.sup, level: 'SUPERVISOR', decision: 'APPROVED', note: 'Đạt yêu cầu kỹ thuật.', createdAt: daysAgo(doneDay, 17) },
      });
    }
    if (i < APPROVED) {
      await prisma.approval.create({
        data: { stepId: s.id, approverId: u.owner, level: 'OWNER', decision: 'APPROVED', createdAt: daysAgo(doneDay - 1 || 0, 8) },
      });
    }
    if (i === APPROVED + 1) {
      await prisma.approval.create({
        data: { stepId: s.id, approverId: u.sup, level: 'SUPERVISOR', decision: 'REJECTED', note: 'Thép đai chưa đủ khoảng cách, làm lại.', createdAt: daysAgo(2, 10) },
      });
      await prisma.comment.create({
        data: { stepId: s.id, authorId: u.sup, body: `@${USERS.sub.name} khoảng cách đai >150mm, sửa lại giúp.`, qualityDecision: 'FAILED', createdAt: daysAgo(2, 10) },
      });
    }
  }
  const openStep = flat[APPROVED + 2];
  await prisma.comment.create({
    data: { stepId: openStep.id, authorId: u.sub, body: 'Đang thi công, dự kiến xong trong 2 ngày.', progressPercent: 30, createdAt: daysAgo(0, 11) },
  });

  await prisma.defect.createMany({
    data: [
      { projectId: project.id, stepId: flat[APPROVED + 1].id, raisedById: u.sup, title: 'Khoảng cách thép đai không đạt', status: 'OPEN' },
      { projectId: project.id, stepId: flat[3].id, raisedById: u.owner, title: 'Rỗ mặt bê tông góc cột trục A', status: 'FIXED' },
      { projectId: project.id, stepId: flat[1].id, raisedById: u.sup, title: 'Thiếu lớp bê tông lót', status: 'CLOSED' },
    ],
  });

  await prisma.attendanceCheckIn.createMany({
    data: Array.from({ length: 14 }, (_, d) => ({
      projectId: project.id, submittedBy: u.sub, date: new Date(today.getTime() - d * DAY),
      workerCount: 4 + (d % 3), objectKey: 'demo', note: d % 4 === 0 ? 'Trời mưa chiều, nghỉ sớm 1 tiếng' : null,
    })),
  });

  await prisma.materialLog.createMany({
    data: [
      ['Xi măng Hà Tiên PCB40', 120, 'bao', 92000, 3],
      ['Thép Hòa Phát D16', 1.8, 'tấn', 15800000, 5],
      ['Cát vàng bê tông', 12, 'm³', 450000, 6],
      ['Đá 1x2', 15, 'm³', 380000, 6],
      ['Gạch ống 8x18', 8000, 'viên', 1300, 1],
    ].map(([name, quantity, unit, unitPrice, d]) => ({
      projectId: project.id, reportedById: u.main, reportDate: daysAgo(d as number, 7),
      name: name as string, quantity: quantity as number, unit: unit as string, unitPrice: unitPrice as number,
    })),
  });

  await prisma.projectMessage.createMany({
    data: [
      [u.main, 'Chào cả nhà, mai 7h đổ bê tông sàn tầng 1 nhé.', 3, 18],
      [u.sup, '@Đội thợ chú Tư chuẩn bị đầm dùi và che bạt phòng mưa.', 3, 18],
      [u.sub, 'Ok anh chị, tụi em có mặt 6h30.', 3, 19],
      [u.owner, 'Cảm ơn mọi người, sáng mai mình ghé xem.', 3, 20],
      [u.sup, 'Hôm nay đã trả lại bước cốt thép, @Đội thợ chú Tư sửa giúp trong ngày.', 2, 11],
      [u.sub, 'Đã sửa xong, mời @KS Lan (Giám sát) qua nghiệm thu lại.', 0, 9],
    ].map(([authorId, body, d, h]) => ({
      projectId: project.id, authorId: authorId as string, body: body as string, createdAt: daysAgo(d as number, h as number),
    })),
  });

  await prisma.subscription.upsert({
    where: { transactionId: 'demo-ai-premium' },
    update: { userId: u.owner, status: 'ACTIVE', expiresAt: new Date(today.getTime() + 365 * DAY) },
    create: {
      userId: u.owner, plan: 'AI_PREMIUM', store: 'GOOGLE', productId: 'demo', transactionId: 'demo-ai-premium',
      status: 'ACTIVE', expiresAt: new Date(today.getTime() + 365 * DAY),
    },
  });
  await prisma.notification.createMany({
    data: [1, 2, 3].map((d) => ({
      userId: u.owner, type: 'AI_DAILY_SUMMARY', title: `✨ Tổng kết hôm nay — ${project.name}`,
      body: `**Tiến độ:** đội thợ ${4 + (d % 3)} người, hoàn thành các bước theo kế hoạch.\n**Lưu ý:** giám sát yêu cầu chỉnh thép đai, cần theo dõi ngày mai.`,
      data: { projectId: project.id }, createdAt: daysAgo(d, 21),
    })),
  });

  console.log(`Dự án demo: ${project.id} — ${flat.length} bước`);
  for (const v of Object.values(USERS)) console.log(`  ${v.name.padEnd(28)} ${v.email} / ${PASSWORD}`);
}

main().finally(() => prisma.$disconnect());
