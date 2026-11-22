import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class ContentService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private notifications: NotificationsService,
  ) {}

  /** Mẹo xây nhà theo giai đoạn — retention hook chính. */
  activeAds() {
    const now = new Date();
    return this.prisma.ad.findMany({
      where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, title: true, imageUrl: true, linkUrl: true, placement: true },
      orderBy: { startsAt: 'desc' },
    });
  }

  listTips(phaseCode?: string) {
    return this.prisma.tip.findMany({
      where: phaseCode ? { OR: [{ phaseCode }, { phaseCode: null }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  /** Danh mục sản phẩm hiện có — để làm chip lọc ở màn so sánh giá. */
  async listCategories(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  /**
   * Catalog so sánh giá đa nhà cung cấp — trung lập, không ưu tiên nhà cung cấp/sàn TMĐT nào.
   * Mỗi sản phẩm trả về toàn bộ offer sort theo giá tăng dần, rẻ nhất luôn ở đầu mảng.
   */
  listProducts(category?: string, search?: string) {
    return this.prisma.product.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        offers: {
          orderBy: { price: 'asc' },
          include: { supplier: true },
        },
      },
    });
  }

  async propose(projectId: string, userId: string, dto: { offerId: string; note?: string }) {
    await this.projects.requireMember(projectId, userId, ['MAIN_CONTRACTOR', 'SUB_CONTRACTOR']);
    const offer = await this.prisma.productOffer.findUnique({
      where: { id: dto.offerId },
      include: { product: true },
    });
    if (!offer) throw new NotFoundException('Không tìm thấy báo giá này');
    const proposal = await this.prisma.materialProposal.create({
      data: { projectId, offerId: dto.offerId, proposerId: userId, note: dto.note },
      include: { offer: { include: { product: true, supplier: true } } },
    });
    await this.notifications.notifyProject(projectId, {
      title: 'Có đề xuất vật liệu mới',
      body: `Đề xuất "${offer.product.name}" đang chờ chủ nhà chốt.`,
      excludeUserId: userId,
      roles: ['OWNER'],
      type: 'PROPOSAL_CREATED',
      data: { projectId },
    });
    return proposal;
  }

  async decide(proposalId: string, userId: string, approve: boolean) {
    const proposal = await this.prisma.materialProposal.findUnique({
      where: { id: proposalId },
      include: { offer: { include: { product: true } } },
    });
    if (!proposal) throw new NotFoundException();
    await this.projects.requireMember(proposal.projectId, userId, ['OWNER']);
    const updated = await this.prisma.materialProposal.update({
      where: { id: proposalId },
      data: { status: approve ? 'APPROVED' : 'REJECTED' },
      include: { offer: { include: { product: true, supplier: true } } },
    });
    await this.notifications.notifyUser(proposal.proposerId, {
      title: approve ? 'Đề xuất vật liệu được chốt' : 'Đề xuất vật liệu bị từ chối',
      body: `"${proposal.offer.product.name}" đã ${approve ? 'được chốt' : 'bị từ chối'}.`,
      type: 'PROPOSAL_DECIDED',
      data: { projectId: proposal.projectId },
    });
    return updated;
  }

  async listProposals(projectId: string, userId: string) {
    await this.projects.requireMember(projectId, userId);
    return this.prisma.materialProposal.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        offer: { include: { product: true, supplier: true } },
        proposer: { select: { id: true, name: true } },
      },
    });
  }
}
