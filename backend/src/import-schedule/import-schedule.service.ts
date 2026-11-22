import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { STANDARD_TEMPLATE_NAME, templatePhaseAppliesToContract } from '../projects/contract-scope.util';
import { PlanChangeService } from '../plan-change/plan-change.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

type FileContent = { kind: 'pdf'; base64: string } | { kind: 'text'; text: string };

interface DraftStep {
  name: string;
  acceptance?: string;
  mandatory?: boolean;
  minPhotos?: number;
  requiresVideo?: boolean;
}

interface DraftPhase {
  code?: string;
  name: string;
  plannedDurationDays?: number;
  steps: DraftStep[];
}

interface ImportComparison {
  missingFromImport: string[];
  addedByContractor: string[];
  narrative: string;
}

/**
 * Import file tiến độ thi công (PDF/Excel) của thầu chính, dùng Claude API để đọc & map thành cây
 * hạng mục/bước, so sánh với quy trình chuẩn của hệ thống, rồi tạo 1 PlanChangeRequest (loại
 * IMPORT_SCHEDULE) để chủ nhà duyệt 1 lần cho toàn bộ thay vì từng dòng lẻ — xem
 * ProjectsService.applyImportSchedule + PlanChangeService (case 'IMPORT_SCHEDULE').
 */
@Injectable()
export class ImportScheduleService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private planChange: PlanChangeService,
  ) {}

  /** PDF được gửi thẳng cho Claude dưới dạng document (đọc bằng thị giác) — không trích text bằng
   * thư viện riêng, vì nhiều file tiến độ thực tế là bản scan/ảnh (xuất từ MS Project/Excel ra PDF
   * dạng in ảnh), không có lớp text để trích. Excel thì trích CSV như cũ vì luôn có text thật. */
  private buildFileContent(file: Express.Multer.File): FileContent {
    const name = file.originalname.toLowerCase();
    if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
      return { kind: 'pdf', base64: file.buffer.toString('base64') };
    }
    if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel')
    ) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const text = workbook.SheetNames.map((sheetName) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        return `--- ${sheetName} ---\n${csv}`;
      }).join('\n\n');
      return { kind: 'text', text };
    }
    throw new BadRequestException('Chỉ hỗ trợ file PDF hoặc Excel (.xlsx/.xls)');
  }

  /** So sánh chỉ với hạng mục PHÙ HỢP loại hợp đồng của dự án — dự án Nhà cải tạo/Nhà chung cư
   * không cần AI báo "thiếu" các hạng mục kết cấu thô vốn không áp dụng (kết cấu đã có sẵn), xem
   * `templatePhaseAppliesToContract`. */
  private async getStandardReference(
    templateId: string | null,
    contractType: ContractType,
  ): Promise<string> {
    const include = {
      phases: {
        orderBy: { order: 'asc' as const },
        include: { steps: { orderBy: { order: 'asc' as const } } },
      },
    };
    const template = templateId
      ? await this.prisma.processTemplate.findUnique({ where: { id: templateId }, include })
      : await this.prisma.processTemplate.findFirst({ where: { name: STANDARD_TEMPLATE_NAME }, include });
    if (!template) return '(Dự án không có quy trình thi công chuẩn tham chiếu)';
    return template.phases
      .filter((p) => templatePhaseAppliesToContract(p.scope, contractType))
      .map((p) => {
        const steps = p.steps.map((s) => `  - ${s.name}`).join('\n');
        return `${p.code}. ${p.name} (mặc định ${p.defaultDurationDays} ngày)\n${steps}`;
      })
      .join('\n');
  }

  private normalizeDraftPhases(input: unknown): DraftPhase[] {
    const phases: DraftPhase[] = [];
    for (const p of Array.isArray(input) ? input : []) {
      if (!p || typeof p !== 'object') continue;
      const raw = p as Record<string, unknown>;
      const name = String(raw.name ?? '').trim();
      if (!name) continue;

      const steps: DraftStep[] = [];
      for (const s of Array.isArray(raw.steps) ? raw.steps : []) {
        if (!s || typeof s !== 'object') continue;
        const rawStep = s as Record<string, unknown>;
        const stepName = String(rawStep.name ?? '').trim();
        if (!stepName) continue;
        steps.push({
          name: stepName,
          acceptance: rawStep.acceptance ? String(rawStep.acceptance) : undefined,
          mandatory: typeof rawStep.mandatory === 'boolean' ? rawStep.mandatory : true,
          minPhotos: typeof rawStep.minPhotos === 'number' ? rawStep.minPhotos : undefined,
          requiresVideo: typeof rawStep.requiresVideo === 'boolean' ? rawStep.requiresVideo : undefined,
        });
      }
      if (steps.length === 0) continue;

      phases.push({
        code: raw.code ? String(raw.code) : undefined,
        name,
        plannedDurationDays:
          typeof raw.plannedDurationDays === 'number' ? raw.plannedDurationDays : undefined,
        steps,
      });
    }
    if (phases.length === 0) {
      throw new BadRequestException('AI không nhận diện được hạng mục thi công hợp lệ nào từ file');
    }
    return phases;
  }

  private normalizeComparison(input: unknown): ImportComparison {
    const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    return {
      missingFromImport: Array.isArray(raw.missingFromImport)
        ? raw.missingFromImport.map(String)
        : [],
      addedByContractor: Array.isArray(raw.addedByContractor)
        ? raw.addedByContractor.map(String)
        : [],
      narrative: typeof raw.narrative === 'string' ? raw.narrative : '',
    };
  }

  private async callClaude(
    fileContent: FileContent,
    standardReference: string,
  ): Promise<{ draftPhases: DraftPhase[]; comparison: ImportComparison }> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('Chưa cấu hình ANTHROPIC_API_KEY trên server');
    }

    const promptText = `Bạn là trợ lý phân tích tiến độ thi công xây dựng nhà ở tại Việt Nam.

QUY TRÌNH THI CÔNG CHUẨN CỦA HỆ THỐNG (dùng để so sánh):
${standardReference}

${
  fileContent.kind === 'pdf'
    ? 'File tiến độ thi công của thầu chính được đính kèm ở trên (có thể là file scan/ảnh chụp — hãy đọc bằng khả năng thị giác, không chỉ dựa vào lớp text nếu có).'
    : `NỘI DUNG FILE TIẾN ĐỘ THI CÔNG DO THẦU CHÍNH TẢI LÊN (trích xuất từ Excel):\n${fileContent.text.slice(0, 60000)}`
}

NHIỆM VỤ:
1. Đọc file trên, xác định danh sách các hạng mục thi công (phases) và các bước/công việc (steps) bên trong từng hạng mục, theo đúng thứ tự trong file.
2. So sánh với quy trình chuẩn ở trên: hạng mục nào chuẩn có mà file thiếu (missingFromImport), hạng mục nào file có thêm mà chuẩn không có (addedByContractor).
3. Viết 1 đoạn mô tả ngắn gọn (narrative, tiếng Việt, 2-4 câu) cho CHỦ NHÀ hiểu sự khác biệt giữa kế hoạch thầu đề xuất và quy trình chuẩn.

Trả lời DUY NHẤT bằng JSON hợp lệ, không kèm markdown code fence hay giải thích gì thêm, đúng cấu trúc:
{
  "draftPhases": [
    {
      "code": "mã chuẩn nếu khớp, để trống nếu là hạng mục tuỳ chỉnh",
      "name": "tên hạng mục",
      "plannedDurationDays": số nguyên ngày dự kiến (ước lượng nếu file không ghi rõ),
      "steps": [{ "name": "tên bước/công việc", "mandatory": true }]
    }
  ],
  "comparison": {
    "missingFromImport": ["tên hạng mục chuẩn bị thiếu"],
    "addedByContractor": ["tên hạng mục thầu thêm ngoài chuẩn"],
    "narrative": "mô tả ngắn gọn"
  }
}`;

    const content: Record<string, unknown>[] =
      fileContent.kind === 'pdf'
        ? [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: fileContent.base64 },
            },
            { type: 'text', text: promptText },
          ]
        : [{ type: 'text', text: promptText }];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new BadRequestException(`Lỗi gọi AI phân tích file: ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      stop_reason?: string;
      content: { type: string; text?: string }[];
    };
    if (data.stop_reason === 'refusal') {
      throw new BadRequestException('AI từ chối phân tích file này');
    }
    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock?.text) {
      throw new BadRequestException('AI không trả về kết quả phân tích hợp lệ');
    }
    const jsonText = textBlock.text
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let parsed: { draftPhases?: unknown; comparison?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new BadRequestException('Không đọc được kết quả phân tích từ AI (không phải JSON hợp lệ)');
    }

    return {
      draftPhases: this.normalizeDraftPhases(parsed.draftPhases),
      comparison: this.normalizeComparison(parsed.comparison),
    };
  }

  async requestImport(
    projectId: string,
    actorId: string,
    file: Express.Multer.File,
    note?: string,
  ) {
    if (!file) throw new BadRequestException('Thiếu file tiến độ (PDF hoặc Excel)');
    await this.projects.requireMember(projectId, actorId, ['MAIN_CONTRACTOR']);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException();
    if (project.status !== 'PLANNING') {
      throw new BadRequestException(
        'Chỉ nhập tiến độ mới lúc đang lập kế hoạch, trước khi bắt đầu thi công',
      );
    }

    const fileContent = this.buildFileContent(file);
    const standardReference = await this.getStandardReference(
      project.templateId,
      project.contractType,
    );
    const { draftPhases, comparison } = await this.callClaude(fileContent, standardReference);

    return this.planChange.request(projectId, actorId, {
      type: 'IMPORT_SCHEDULE',
      payload: { draftPhases, comparison, sourceFileName: file.originalname },
      note,
    });
  }
}
