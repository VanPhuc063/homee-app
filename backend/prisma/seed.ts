import { PrismaClient } from '@prisma/client';
import processData from './seed-data/standard-process.json';

const prisma = new PrismaClient();

// 1. Template quy trình chuẩn từ PDF XA + hạng mục kết cấu thô bổ sung (2026-07-26). Upsert theo
// `code` từng hạng mục (không chỉ tạo mới nếu chưa có template) để lần seed sau vẫn thêm được các
// hạng mục/scope mới vào 1 template đã tồn tại sẵn trên máy dev, không cần xoá DB làm lại từ đầu.
async function seedTemplate() {
  let template = await prisma.processTemplate.findFirst({ where: { name: processData.name } });
  if (!template) {
    template = await prisma.processTemplate.create({
      data: { name: processData.name, version: processData.version },
    });
  } else if (template.version !== processData.version) {
    template = await prisma.processTemplate.update({
      where: { id: template.id },
      data: { version: processData.version },
    });
  }

  // Xoá hạng mục nào KHÔNG còn trong JSON (VD đổi code lúc sắp lại thứ tự thi công thật, xem
  // "Trình tự xây nhà hoàn chỉnh" 2026-09) — cascade xoá luôn TemplateStep của nó. An toàn với dự
  // án đang chạy: TemplatePhase/TemplateStep chỉ là NGUỒN copy lúc tạo dự án (ProjectsService.
  // create), xoá/sửa ở đây không đụng tới Phase/Step đã tạo cho dự án có sẵn.
  const jsonCodes = processData.phases.map((p) => p.code);
  await prisma.templatePhase.deleteMany({
    where: { templateId: template.id, code: { notIn: jsonCodes } },
  });

  for (const p of processData.phases) {
    const phaseData = {
      order: p.order,
      name: p.name,
      defaultDurationDays: p.defaultDurationDays,
      scope: p.scope as 'KET_CAU_THO' | 'HOAN_THIEN' | 'THAO_DO',
    };
    const existingPhase = await prisma.templatePhase.findFirst({
      where: { templateId: template.id, code: p.code },
    });
    const stepsData = p.steps.map((s) => ({
      order: s.order,
      name: s.name,
      acceptance: s.acceptance,
      mandatory: s.mandatory,
      minPhotos: s.minPhotos,
      requiresVideo: s.requiresVideo,
      floorLabel: (s as { floorLabel?: string }).floorLabel,
    }));
    if (!existingPhase) {
      await prisma.templatePhase.create({
        data: { ...phaseData, code: p.code, templateId: template.id, steps: { create: stepsData } },
      });
    } else {
      // Thay MỚI toàn bộ steps thay vì diff từng dòng — nội dung bước (cách kiểm soát, nghiệm
      // thu) sửa đổi liên tục nên xoá-tạo-lại đơn giản và chắc chắn khớp JSON hơn diff thủ công.
      await prisma.templateStep.deleteMany({ where: { phaseId: existingPhase.id } });
      await prisma.templatePhase.update({
        where: { id: existingPhase.id },
        data: { ...phaseData, steps: { create: stepsData } },
      });
    }
  }
  console.log(`Seeded template: ${processData.name} (${processData.phases.length} hạng mục)`);
}

async function main() {
  await seedTemplate();

  // 2. Bài viết Thông tin (mockup 24). Chỉ thêm bài mockup còn thiếu (theo tiêu đề), không đụng bài đã có.
  const blog = [
    { emoji: '💧', category: 'Hoàn thiện', phaseCode: 'B-17', readMinutes: 5, createdAt: '2026-09-28',
      title: '5 sai lầm phổ biến khi chống thấm WC',
      body: 'Bỏ bước ngâm thử nước 72 giờ, không xử lý cổ ống, quét chống thấm quá mỏng, không chạy chân tường lên 30cm và lát gạch khi lớp chống thấm chưa khô. Yêu cầu thầu chụp ảnh mốc nước lúc bắt đầu và sau 72h.' },
    { emoji: '🧱', category: 'Phần thô', phaseCode: 'B-16', readMinutes: 8, createdAt: '2026-09-25',
      title: 'Cách kiểm tra chất lượng tô trát tường',
      body: 'Dùng thước nhôm 2m áp sát tường, khe hở không quá 3mm. Gõ nhẹ để phát hiện bộp. Kiểm tra lưới thép tại mối nối bê tông và tường xây, và độ ẩm tường trước khi trát.' },
    { emoji: '💡', category: 'Mẹo hay', phaseCode: null, readMinutes: 10, createdAt: '2026-09-20',
      title: 'So sánh 10 loại xi măng phổ biến tại VN',
      body: 'PCB30 cho xây trát, PCB40 cho bê tông kết cấu. Ưu tiên hàng có tem chống giả, ngày sản xuất dưới 2 tháng, bao không vón cục.' },
    { emoji: '🔢', category: 'Phần thô', phaseCode: 'B-06', readMinutes: 6, createdAt: '2026-09-18',
      title: 'Công thức tính khối lượng bê tông',
      body: 'Thể tích = dài × rộng × dày. Cộng thêm 3–5% hao hụt. Với móng băng tính theo tiết diện × chiều dài tim móng.' },
  ];
  for (const t of blog) {
    const exists = await prisma.tip.findFirst({ where: { title: t.title } });
    if (!exists) await prisma.tip.create({ data: { ...t, createdAt: new Date(t.createdAt) } });
  }
  console.log('Seeded blog Thông tin');

  // 3. Shop vật dụng (mockup 25): sản phẩm dạng blog + link Shopee. Dữ liệu demo nên xoá-và-seed-lại
  // mỗi lần chạy (MaterialProposal thật tham chiếu offer sẽ chặn xoá bằng khoá ngoại, không mất dữ liệu).
  await prisma.product.deleteMany({});
  await prisma.supplier.deleteMany({});
  const shopee = await prisma.supplier.create({ data: { name: 'Shopee', isMarketplace: true } });

  const catalog = [
    { emoji: '🔧', category: 'Dụng cụ', name: 'Máy khoan Bosch GSB 550',
      description: 'Máy khoan đa năng, phù hợp cho thi công nhà ở. Công suất 550W, mũi 13mm.', price: 1290000, originalPrice: 1590000 },
    { emoji: '⛑️', category: 'An toàn', name: 'Mũ bảo hộ 3M H-700',
      description: 'Mũ bảo hộ tiêu chuẩn an toàn công trường. Nhẹ, thoáng khí, bảo vệ đầu hiệu quả.', price: 185000, originalPrice: 250000 },
    { emoji: '📏', category: 'Dụng cụ', name: 'Thước laser Bosch GLM 50C',
      description: 'Đo khoảng cách chính xác bằng laser, kết nối Bluetooth, đo lên đến 50m.', price: 2450000, originalPrice: null },
    { emoji: '🎨', category: 'Vật liệu', name: 'Sơn Dulux Inspire 18L',
      description: 'Sơn nội thất cao cấp, bề mặt mịn, kháng khuẩn, chống bám bẩn. Nhiều màu.', price: 1150000, originalPrice: null },
  ];
  for (const p of catalog) {
    await prisma.product.create({
      data: {
        name: p.name,
        category: p.category,
        emoji: p.emoji,
        description: p.description,
        originalPrice: p.originalPrice,
        offers: {
          create: [{ supplierId: shopee.id, price: p.price, affiliateUrl: `https://shopee.vn/search?keyword=${encodeURIComponent(p.name)}` }],
        },
      },
    });
  }
  console.log(`Seeded ${catalog.length} sản phẩm Shop vật dụng`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
