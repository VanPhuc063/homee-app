export type ProjectRole = 'OWNER' | 'MAIN_CONTRACTOR' | 'SUB_CONTRACTOR' | 'SUPERVISOR';

/// Gói subscription qua IAP — xem SubscriptionService (backend) + plan-catalog.ts.
export type SubscriptionPlanId =
  | 'OWNER_MONTHLY'
  | 'OWNER_6MONTH'
  | 'OWNER_9MONTH'
  | 'OWNER_12MONTH'
  | 'CONTRACTOR_MONTHLY'
  | 'CONTRACTOR_10PROJECTS'
  | 'CONTRACTOR_YEARLY'
  | 'AI_PREMIUM';

export interface PlanDef {
  productId: string;
  label: string;
  priceVnd: number;
  kind: 'SUBSCRIPTION' | 'ONE_TIME';
  durationDays: number | null;
  audience: 'OWNER' | 'CONTRACTOR' | 'ADDON';
  badge?: 'POPULAR' | 'BEST';
}

export interface SubscriptionStatus {
  plan: {
    plan: SubscriptionPlanId;
    label: string;
    expiresAt: string | null;
    isAutoRenewing: boolean;
  } | null;
  aiPremium: boolean;
}

/// Affiliate flat 1 tầng — mọi user đều có mã giới thiệu riêng ngay từ lúc tạo tài khoản, không có
/// khái niệm founder/CTV cần duyệt. Xem AffiliateService (backend).
export interface MyReferralInfo {
  referralCode: string;
  totalReferrals: number;
  totalCommission: number;
  withdrawable: number;
  referrals: { id: string; name: string; joinedAt: string; earnings: number }[];
  recentCommissions: { id: string; customerName: string; amount: number; createdAt: string }[];
}

export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface Withdrawal {
  id: string;
  amount: number;
  bankName: string;
  bankAccount: string;
  status: WithdrawalStatus;
  createdAt: string;
}

/// Loại đội — chỉ có ý nghĩa với thầu phụ (SUB_CONTRACTOR) đứng vai đội trưởng, xem TeamType
/// (backend). Null/undefined = thầu phụ mời theo hạng mục như cũ, không dùng điểm danh/báo cáo đội.
export type TeamType =
  | 'PHAN_THO'
  | 'SON'
  | 'THACH_CAO'
  | 'DA'
  | 'KINH_CAU_THANG'
  | 'CUA_NHOM'
  | 'KHAC';

/// 5 mô hình hợp đồng — THO_VA_NHAN_CONG_HOAN_THIEN: thầu trọn gói phần thô + chỉ nhân công phần
/// hoàn thiện (phổ biến nhất). TRON_GOI_A_Z: thầu lo trọn gói từ đầu đến cuối. CAI_TAO: nhà cải
/// tạo (đã có sẵn kết cấu). CHUNG_CU: nhà chung cư (kết cấu toà nhà có sẵn, chỉ hoàn thiện nội
/// thất). NHAN_CONG: chỉ thi công nhân công toàn bộ, chủ đầu tư tự mua vật tư (không cần duyệt
/// vật tư).
export type ContractType =
  | 'THO_VA_NHAN_CONG_HOAN_THIEN'
  | 'TRON_GOI_A_Z'
  | 'CAI_TAO'
  | 'CHUNG_CU'
  | 'NHAN_CONG';

export interface Member {
  id: string;
  role: ProjectRole;
  userId: string;
  assignedPhaseCodes: string[];
  /// Giám sát mời theo từng bước cụ thể (task-based) — rỗng cùng assignedPhaseCodes nghĩa là giám
  /// sát toàn thời gian/bán thời gian, xem toàn bộ dự án.
  assignedStepIds: string[];
  /// Chỉ có với role SUB_CONTRACTOR đứng vai đội trưởng — xem TeamType.
  teamType?: TeamType | null;
  // null khi API ẩn SĐT — chỉ chủ nhà/thầu chính mới thấy SĐT của thành viên khác (xem
  // `ProjectsService.listMine`), người khác chỉ thấy SĐT của chính mình.
  user: { id: string; name: string; phone: string | null };
}

/// 1 dòng trong "Tổng quan điểm danh" (GET /projects/:id/teams) — xem TeamService.overview.
export interface TeamOverview {
  memberId: string;
  teamType: TeamType;
  teamTypeLabel: string;
  leader: { id: string; name: string; phone: string | null };
  workerCount: number;
  presentToday: number;
  absentToday: number;
  absentWorkers: { name: string; reason: string | null }[];
  checkedInToday: boolean;
  reportSubmittedToday: boolean;
}

export interface TeamWorker {
  id: string;
  name: string;
  present: boolean | null;
  absenceReason: string | null;
}

export interface TeamReportMedia {
  id: string;
  objectKey: string;
  type: 'PHOTO' | 'VIDEO';
}

export interface TeamDailyReport {
  id: string;
  workDone: string;
  planTomorrow: string | null;
  issues: string | null;
  createdAt: string;
  media: TeamReportMedia[];
}

/// Màn của chính đội trưởng (GET /projects/:id/teams/me) — xem TeamService.myTeam.
export interface MyTeam {
  teamType: TeamType;
  teamTypeLabel: string;
  workers: TeamWorker[];
  report: TeamDailyReport | null;
}

/// 1 dòng trong AI đối chiếu tiến độ (GET /projects/:id/ai/schedule-review) — xem
/// AiService.scheduleReview. `reason`/`impact`/`quote`/`severity` chỉ có giá trị khi status =
/// 'DELAYED'.
export interface AiScheduleReviewRow {
  phaseCode: string;
  phaseName: string;
  status: 'NOT_STARTED' | 'ON_TIME' | 'DELAYED' | 'AHEAD' | 'DONE';
  severity: 'SEVERE' | 'MINOR' | null;
  delayDays: number;
  percentComplete: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  reason: string | null;
  impact: string | null;
  quote: string | null;
}

export interface AiScheduleReview {
  counts: { onTime: number; delayed: number; ahead: number; notStarted: number };
  overallPercent: number;
  overallNarrative: string;
  rows: AiScheduleReviewRow[];
}

export interface AiDailySummary {
  body: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  address?: string;
  status: 'DRAFT' | 'PLANNING' | 'ACTIVE' | 'HANDOVER' | 'DONE';
  contractType: ContractType;
  driveAccountId?: string | null;
  /// true nếu NGƯỜI ĐANG XEM là chủ tài khoản Google Drive đã kết nối cho dự án này — dự án có
  /// thể do thầu chính tạo (tự chọn Drive của chính họ), không phải luôn là chủ nhà, nên dùng
  /// field này thay vì giả định "chỉ OWNER mới kết nối lại được" khi gọi showDriveUploadError.
  canManageDrive?: boolean;
  /// 1 dự án = 1 bên trả tiền (người tạo dự án) — thành viên được mời dùng miễn phí.
  isBillingOwner?: boolean;
  billingOwnerName?: string | null;
  /// Hết 2 tháng dùng thử và bên trả chưa có gói: chỉ xem/xuất PDF, không ghi (ReadOnlyMiddleware).
  readOnly?: boolean;
  trialStartedAt?: string;
  createdAt?: string;
  /// Mốc "ngày 0" của lịch thi công dự kiến — null lúc còn PLANNING (xem Phase.plannedStartDate).
  constructionStartDate?: string | null;
  members: Member[];
  phases: { id: string; code: string; name: string; order: number; status: string }[];
  materialCheck?: { status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' } | null;
}

/// Tài khoản Google Drive đã kết nối (chủ nhà) — dùng để chọn lúc tạo công trình và lưu ảnh/video
/// công trình dưới Homee/<công trình>/<hạng mục>, tránh chi phí lưu trữ hạ tầng của app.
export interface GoogleDriveAccount {
  id: string;
  email: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  objectKey: string;
  thumbKey?: string;
  createdAt: string;
  uploader?: { id: string; name: string };
  comments?: CommentT[];
}

export interface Approval {
  id: string;
  level: 'SUPERVISOR' | 'OWNER';
  decision: 'APPROVED' | 'REJECTED';
  note?: string;
  /// Ảnh giám sát chụp thiết bị đo lúc nghiệm thu — bắt buộc khi level SUPERVISOR (book giám sát),
  /// null với duyệt của OWNER.
  equipmentPhotoKey?: string | null;
  createdAt: string;
  approver: { id: string; name: string };
}

export interface CommentT {
  id: string;
  body: string;
  createdAt: string;
  /// `role` là vai trò trong dự án hiện tại (ProjectMember.role), có thể null nếu tác giả không
  /// còn là thành viên dự án — xem WorkflowService.getStepDetail (backend).
  author: { id: string; name: string; role?: ProjectRole | null };
}

/// 1 lượt báo cáo trong Nhật ký ngày — thực chất là Comment (backend) có thêm progressPercent
/// (thầu) hoặc qualityDecision (giám sát). Xem SchedulingService.postDailyReport.
export interface DailyReport {
  id: string;
  body: string;
  progressPercent: number | null;
  qualityDecision: 'PASSED' | 'FAILED' | null;
  createdAt: string;
  author: { id: string; name: string };
}

export interface DailyLogStep {
  stepId: string;
  name: string;
  phaseId: string;
  phaseCode: string;
  phaseName: string;
  floorLabel?: string | null;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  delayDays: number | null;
  latestProgressPercent: number | null;
  photoCountToday: number;
  videoCountToday: number;
  reports: DailyReport[];
}

/// 1 bước thầu CÓ THỂ chọn báo cáo hôm nay (đang mở/bị từ chối, chưa được chọn) — xem
/// SchedulingService.getDailyLog "pickableSteps".
export interface PickableStep {
  stepId: string;
  name: string;
  phaseId: string;
  phaseCode: string;
  phaseName: string;
  status: string;
}

/// Chấm công 1 lần của 1 thầu trong ngày — xem SchedulingService.postCheckIn (backend).
export interface CheckIn {
  id: string;
  userId: string;
  userName: string;
  workerCount: number;
  objectKey: string;
  note: string | null;
  createdAt: string;
}

/// 1 dòng vật tư trong Nhật ký vật tư — xem MaterialLogService.getDailyLog (backend). `unitPrice`/
/// `total` null khi viewer không phải MAIN_CONTRACTOR (chỉ người chi tiền mới thấy giá).
export interface MaterialLogItem {
  id: string;
  reportDate: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  total: number | null;
  note: string | null;
  reportedBy: { id: string; name: string };
  createdAt: string;
  steps: { stepId: string; stepCode: string; stepName: string; phaseName: string }[];
  photos: { id: string; objectKey: string }[];
  canEdit: boolean;
}

export interface MaterialDayNote {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

/// Nhật ký vật tư cho 1 ngày cụ thể — khác hẳn MaterialCheckData (cổng duyệt vật tư trước thi
/// công) — đây là log liên tục theo ngày. Xem MaterialLogService.getDailyLog (backend).
export interface MaterialLogData {
  date: string;
  canSeePrice: boolean;
  canAdd: boolean;
  canSeeNotes: boolean;
  canSendNote: boolean;
  items: MaterialLogItem[];
  dailyTotal: number | null;
  metrics: { materialCount: number; withInvoiceCount: number; stepCount: number };
  notes: MaterialDayNote[];
}

/// 1 bước thi công để chọn gắn vào vật tư — dùng chung shape với PickableStep nhưng KHÔNG lọc theo
/// status (khác Nhật ký ngày, vật tư gắn được cho bất kỳ bước nào kể cả đã xong/chưa mở).
export interface MaterialStepOption {
  stepId: string;
  stepCode: string;
  stepName: string;
  phaseName: string;
}

/// Nhật ký ngày cho 1 ngày cụ thể — xem SchedulingService.getDailyLog (backend).
export interface DailyLogData {
  date: string;
  dayIndex: number;
  totalDays: number;
  weekNumber: number;
  plannedPercent: number;
  actualPercent: number;
  deviationPercent: number;
  checkIns: CheckIn[];
  totalWorkerCount: number;
  projectDelayDays: number | null;
  weather: { tempC: number; condition: string; rainWindow: string | null } | null;
  steps: DailyLogStep[];
  pickableSteps: PickableStep[];
}

export interface Step {
  id: string;
  order: number;
  name: string;
  acceptance?: string;
  mandatory: boolean;
  minPhotos: number;
  requiresVideo: boolean;
  /// Nhãn tầng (VD "Tầng trệt", "Lầu 2") cho bước lặp theo tầng — null với bước không lặp theo
  /// tầng. Bấm "+" trong Plan editor để nhân bản thêm cho tầng khác (PlanEditor.PhasePlanCard).
  floorLabel?: string | null;
  status: string;
  evidences: Evidence[];
  approvals: Approval[];
  comments?: CommentT[];
  _count?: { comments: number };
  phase?: { projectId: string; code: string; name: string };
  /// false = không có giám sát phụ trách bước này, chủ nhà đánh giá thẳng (WorkflowService.stepHasSupervisor).
  hasSupervisor?: boolean;
}

export interface Phase {
  id: string;
  code: string;
  order: number;
  name: string;
  status: 'LOCKED' | 'IN_PROGRESS' | 'DONE';
  plannedDurationDays: number;
  /// Tính dồn từ Project.constructionStartDate (hoặc hôm nay nếu chưa duyệt kế hoạch — bản xem
  /// trước) theo thứ tự + plannedDurationDays của từng hạng mục. Dùng cho màn Lịch thi công.
  plannedStartDate: string;
  plannedEndDate: string;
  steps: Step[];
}

/// Tổng hợp số liệu cho màn Dashboard (Tổng quan công trình) — xem SchedulingService.getDashboard
/// (backend). Chỉ chứa số liệu tính được từ dữ liệu đã có sẵn (Evidence/Approval/MaterialCheck),
/// không có số thợ trên công trường hôm nay (chưa có tính năng chấm công).
export interface DashboardData {
  projectName: string;
  address: string | null;
  totalDays: number;
  elapsedDays: number;
  plannedPercent: number;
  actualPercent: number;
  deviationPercent: number;
  phasesTotal: number;
  phasesDone: number;
  contractualHandoverDate: string | null;
  forecastHandoverDate: string | null;
  forecastDelayDays: number | null;
  materials: { total: number; approved: number; pending: number; rejected: number };
  weeklyEvidenceCount: number;
  acceptedStepsCount: number;
  totalStepsCount: number;
  mostDelayedStep: {
    stepId: string;
    name: string;
    delayDays: number;
    downstreamAffectedCount: number;
  } | null;
  phases: {
    id: string;
    code: string;
    name: string;
    status: 'LOCKED' | 'IN_PROGRESS' | 'DONE';
    percent: number;
    stepsDone: number;
    stepsTotal: number;
  }[];
}

export interface PaymentStage {
  id: string;
  order: number;
  name: string;
  amount: string;
  status: 'LOCKED' | 'ELIGIBLE' | 'CONFIRMED_PAID';
  paidAt?: string;
  unlockAfterPhase: { code: string; name: string; status: string };
}

export interface Tip {
  id: string;
  phaseCode?: string;
  title: string;
  body: string;
  linkUrl?: string;
  category?: string | null;
  emoji?: string | null;
  readMinutes?: number | null;
  createdAt: string;
}

export interface AvailablePhase {
  code: string;
  name: string;
  order: number;
  stepCount: number;
}

/** Hạng mục của quy trình chuẩn theo hình thức hợp đồng — dùng cho checklist "Chọn bước thi công
 * áp dụng" lúc tạo dự án, xem ProjectsService.getTemplatePhases (backend). */
export interface TemplatePhase {
  code: string;
  name: string;
  order: number;
  stepCount: number;
  stepNames: string[];
  repeatsPerFloor: boolean;
}

export interface Defect {
  id: string;
  title: string;
  status: 'OPEN' | 'FIXED' | 'CLOSED';
  createdAt: string;
  raisedBy: { id: string; name: string };
  step?: { id: string; name: string } | null;
}

export interface Supplier {
  id: string;
  name: string;
  isMarketplace: boolean;
  logoUrl?: string;
}

export interface ProductOffer {
  id: string;
  productId: string;
  supplierId: string;
  price: string;
  affiliateUrl?: string;
  note?: string;
  updatedAt: string;
  supplier: Supplier;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  unit?: string;
  imageUrl?: string;
  description?: string | null;
  emoji?: string | null;
  originalPrice?: string | null;
  /** Sort theo giá tăng dần từ backend — offers[0] luôn là giá rẻ nhất, không ưu tiên nguồn nào. */
  offers: ProductOffer[];
}

export interface MaterialCheckPhoto {
  id: string;
  objectKey: string;
  createdAt: string;
  uploader: { id: string; name: string };
}

export interface MaterialBatchComment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
}

/// 1 đợt tập kết của 1 loại vật tư — 1 loại có thể tập kết nhiều lần nếu bị từ chối rồi bổ sung,
/// mỗi đợt giữ ảnh + quyết định + bình luận riêng (xem MaterialCheckService, backend).
export interface MaterialDeliveryBatch {
  id: string;
  batchNumber: number;
  supplierName?: string | null;
  deliveredAt?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  photos: MaterialCheckPhoto[];
  comments: MaterialBatchComment[];
}

export type MaterialCategory = 'THO' | 'SON' | 'CUA' | 'NOI_THAT';

/// 1 loại vật tư (nhóm theo label) trong cổng duyệt — `status` là trạng thái của đợt (batch) mới
/// nhất. `steps` = hạng mục/bước dùng vật tư này ("Dùng cho: Việc X, Y" trong mockup).
/// `submittedByRole` = bên đã khai báo item này ('MAIN_CONTRACTOR' mặc định — thầu tập kết, chủ
/// nhà duyệt; 'OWNER' khi chủ nhà tự khai vật tư có sẵn, thầu chính là bên duyệt/tiếp nhận).
export interface MaterialCheckItem {
  id: string;
  label: string;
  category: MaterialCategory;
  quantityLabel?: string | null;
  unitPrice?: string | null;
  contractValue?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note?: string | null;
  decidedAt?: string | null;
  submittedByRole: 'MAIN_CONTRACTOR' | 'OWNER';
  steps: { id: string; order: number; name: string; phase: { code: string; name: string } }[];
  batches: MaterialDeliveryBatch[];
}

export interface MaterialCheck {
  id: string;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  note?: string;
  submittedAt?: string;
  decidedAt?: string;
  items: MaterialCheckItem[];
}

export type ActivityKind =
  | 'NOTE'
  | 'STEP_SUBMITTED'
  | 'STEP_APPROVED'
  | 'STEP_REJECTED'
  | 'EVIDENCE_ADDED'
  | 'DEFECT_CREATED'
  | 'DEFECT_UPDATED'
  | 'PAYMENT_STAGE_CONFIRMED'
  | 'PLAN_APPROVED'
  | 'MATERIAL_CHECK_SUBMITTED'
  | 'MATERIAL_CHECK_DECIDED'
  | 'PHASE_ADDED'
  | 'PHASE_REMOVED'
  | 'STEP_ADDED'
  | 'STEP_REMOVED'
  | 'PHASE_DURATION_CHANGED'
  | 'PLAN_CHANGE_REQUESTED'
  | 'PLAN_CHANGE_APPROVED'
  | 'PLAN_CHANGE_REJECTED'
  | 'INVITE_ACCEPTED'
  | 'INVITE_DECLINED'
  | 'PHASE_REORDERED';

export type PlanChangeType =
  | 'ADD_PHASE'
  | 'REMOVE_PHASE'
  | 'ADD_STEP'
  | 'REMOVE_STEP'
  | 'ADJUST_DURATION'
  | 'REORDER_PHASES'
  | 'IMPORT_SCHEDULE';

/// Payload của 1 PlanChangeRequest loại IMPORT_SCHEDULE — AI đã map file thầu chính tải lên thành
/// cây hạng mục/bước nháp (draftPhases) + so sánh với quy trình chuẩn (comparison), xem
/// ImportScheduleService (backend).
export interface ImportScheduleDraftPhase {
  code?: string;
  name: string;
  plannedDurationDays?: number;
  steps: { name: string; acceptance?: string; mandatory?: boolean; minPhotos?: number; requiresVideo?: boolean }[];
}

export interface ImportScheduleComparison {
  missingFromImport: string[];
  addedByContractor: string[];
  narrative: string;
}

/// Đề xuất sửa kế hoạch thi công (thầu chính hoặc chủ nhà) chờ bên kia duyệt/từ chối — xem
/// PlanChangeService (backend). `targetApproverRole` cho biết vai trò nào cần duyệt request này.
export interface PlanChangeRequest {
  id: string;
  projectId: string;
  type: PlanChangeType;
  payload: Record<string, any>;
  note?: string | null;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  targetApproverRole: ProjectRole;
  decisionNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  requestedBy: { id: string; name: string };
  decidedBy?: { id: string; name: string } | null;
}

export interface ActivityLog {
  id: string;
  kind: ActivityKind;
  message: string;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

/// Hồ sơ công khai ở tab Khám phá — chỉ số liệu tổng hợp (không tên/địa chỉ dự án cụ thể, không
/// SĐT) để không lộ thông tin chủ nhà cũ. Xem DirectoryService (backend).
export interface Candidate {
  id: string;
  name: string;
  bio: string | null;
  serviceArea: string | null;
  offeredRoles: ProjectRole[];
  avgRating: number | null;
  reviewCount: number;
  completedProjects: { role: ProjectRole; count: number }[];
}

export interface ProjectInvite {
  id: string;
  projectId: string;
  role: ProjectRole;
  assignedPhaseCodes: string[];
  assignedStepIds: string[];
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  respondedAt?: string | null;
  project?: { id: string; name: string; status: Project['status'] };
  inviter?: { id: string; name: string };
  invitee?: { id: string; name: string; email?: string | null };
  teamType?: TeamType | null;
}


export interface Review {
  id: string;
  projectId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  project?: { id: string; name: string };
  reviewee?: { id: string; name: string };
}

/// Đội thợ/thầu phụ quen thuộc của thầu chính — danh bạ cá nhân độc lập với dự án cụ thể, tái sử
/// dụng khi mời vào bất kỳ dự án nào họ làm thầu chính (xem màn Đội của tôi + Thành viên dự án).
export interface CrewMember {
  id: string;
  phone: string;
  name: string;
  defaultRole: ProjectRole;
  createdAt: string;
}

/// Thông báo trong app — lưu thường trực nên có trạng thái đọc/chưa đọc, khác với push (không có
/// lịch sử). `type` để dành cho việc phân icon/điều hướng chi tiết hơn sau này.
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

/// GET /projects/:id/workforce — xem TeamService.workforce (mockup 20).
export interface Workforce {
  date: string;
  myRole: ProjectRole;
  present: number;
  absent: number;
  total: number;
  teams: {
    memberId: string;
    teamType: TeamType;
    teamTypeLabel: string;
    leader: { id: string; name: string };
    isMine: boolean;
    workers: TeamWorker[];
  }[];
  report: {
    sentAt: string;
    presentCount: number;
    totalCount: number;
    photos: { id: string; objectKey: string; createdAt: string }[];
  } | null;
}

/// POST /steps/:id/ai/review — xem AiService.reviewStep (mockup 14–15).
export interface AiStepReview {
  verdict: 'PASS' | 'WARN' | 'FAIL';
  summary: { level: 'OK' | 'NOTE' | 'WARN'; text: string }[];
  photos: { evidenceId: string; items: { level: 'OK' | 'NOTE' | 'WARN'; text: string }[] }[];
  missing: { title: string; detail: string }[];
  checklist: { kind: 'PHOTO' | 'VIDEO'; label: string; done: boolean }[];
  questions: string[];
}

/// Tin nhắn chat nhóm dự án (GET/POST /projects/:id/messages).
export interface ProjectMessage {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  authorRole: ProjectRole | null;
}

/// Quảng cáo của nhà quảng cáo (GET /ads) — admin đăng có hẹn ngày.
export interface Ad {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  placement: 'POPUP' | 'BANNER';
}

/// Mục timeline tab Báo cáo — GET /projects/:id/report-feed.
export type ReportFeedItem =
  | {
      kind: 'REPORT';
      id: string;
      createdAt: string;
      author: { id: string; name: string };
      body: string;
      progressPercent: number | null;
      qualityDecision: 'PASSED' | 'FAILED' | null;
      evidence: { type: 'PHOTO' | 'VIDEO'; objectKey: string } | null;
      step: { id: string; name: string; status: string; floorLabel: string | null; phaseCode: string; phaseName: string };
    }
  | {
      kind: 'CHECKIN';
      id: string;
      createdAt: string;
      author: { id: string; name: string };
      workerCount: number;
      note: string | null;
      objectKey: string;
    };
