export const colors = {
  // Brand mockup v3.0: Green #16a34a (requirements §1).
  primary: '#16A34A',
  primaryLight: '#F0FDF4',
  bg: '#F7F8FA',
  card: '#FFFFFF',
  text: '#17202A',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  danger: '#DC2626',
  warning: '#D97706',
  success: '#16A34A',
  locked: '#9CA3AF',
  /// Màu riêng cho nội dung do AI tạo ra (nhận xét, cảnh báo, gợi ý câu hỏi) — tách khỏi primary để
  /// người dùng phân biệt "AI nói" với hành động/trạng thái thường, khớp mockup (card AI màu tím).
  ai: '#7C3AED',
  /// Màu riêng cho mảng Affiliate/Commission — khớp mockup (card hồng/đỏ tím), tách khỏi primary
  /// để khu vực "kiếm tiền" nổi bật rõ so với các màn quản lý công trình thường.
  affiliate: '#DB2777',
};

export const radius = { sm: 8, md: 12, lg: 16 };

export const stepStatusMeta: Record<string, { label: string; color: string }> = {
  LOCKED: { label: 'Chưa mở', color: colors.locked },
  OPEN: { label: 'Đang thi công', color: colors.warning },
  SUBMITTED: { label: 'Chờ đánh giá', color: '#2563EB' },
  SUPERVISOR_APPROVED: { label: 'Chờ chủ nhà duyệt', color: '#7C3AED' },
  APPROVED: { label: 'Hoàn thành', color: colors.success },
  REJECTED: { label: 'Bị từ chối, làm lại', color: colors.danger },
};

export const phaseStatusMeta: Record<string, { label: string; color: string }> = {
  LOCKED: { label: 'Chưa mở', color: colors.locked },
  IN_PROGRESS: { label: 'Đang thi công', color: colors.warning },
  DONE: { label: 'Hoàn thành', color: colors.success },
};

export const projectStatusMeta: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Nháp', color: colors.locked },
  PLANNING: { label: 'Đang lập kế hoạch', color: colors.warning },
  ACTIVE: { label: 'Đang thi công', color: '#2563EB' },
  HANDOVER: { label: 'Đang bàn giao', color: '#7C3AED' },
  DONE: { label: 'Hoàn thành', color: colors.success },
};

export const roleLabel: Record<string, string> = {
  OWNER: 'Chủ nhà',
  MAIN_CONTRACTOR: 'Thầu chính',
  SUB_CONTRACTOR: 'Thầu phụ',
  SUPERVISOR: 'Giám sát',
};

/// Màu badge vai trò trên comment (avatar + badge) — Chủ nhà xanh lá, thầu (chính/phụ) xanh
/// dương, giám sát tím, khớp mockup product gửi.
export const roleColor: Record<string, string> = {
  OWNER: colors.primary,
  MAIN_CONTRACTOR: '#1D4ED8',
  SUB_CONTRACTOR: '#1D4ED8',
  SUPERVISOR: '#7E22CE',
};

export const teamTypeLabel: Record<string, string> = {
  PHAN_THO: 'Phần thô',
  SON: 'Sơn',
  THACH_CAO: 'Thạch cao',
  DA: 'Đá',
  KINH_CAU_THANG: 'Kính cầu thang',
  CUA_NHOM: 'Cửa nhôm',
  KHAC: 'Khác',
};

/// Màu badge theo loại đội, khớp mockup product gửi.
export const teamTypeColor: Record<string, string> = {
  PHAN_THO: '#2563EB',
  SON: '#D97706',
  THACH_CAO: '#7E22CE',
  DA: '#4F46E5',
  KINH_CAU_THANG: '#0D9488',
  CUA_NHOM: '#DB2777',
  KHAC: colors.textMuted,
};

/// Icon Feather theo loại đội — thay cho emoji trong mockup (🧱🎨📐🪨🪟🚪📦).
export const teamTypeIcon: Record<string, string> = {
  PHAN_THO: 'layers',
  SON: 'droplet',
  THACH_CAO: 'square',
  DA: 'hexagon',
  KINH_CAU_THANG: 'trending-up',
  CUA_NHOM: 'sidebar',
  KHAC: 'package',
};

export const materialCheckStatusMeta: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chưa nộp', color: colors.locked },
  SUBMITTED: { label: 'Chờ chủ nhà kiểm tra', color: colors.warning },
  APPROVED: { label: 'Đã duyệt', color: colors.success },
  REJECTED: { label: 'Bị từ chối, bổ sung lại', color: colors.danger },
};

/// Trạng thái của TỪNG loại vật tư (MaterialCheckItem) — khác materialCheckStatusMeta là trạng
/// thái tổng cả cổng duyệt.
export const materialItemStatusMeta: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', color: colors.warning },
  APPROVED: { label: 'Đã duyệt', color: colors.success },
  REJECTED: { label: 'Bị từ chối', color: colors.danger },
};

export const materialCategoryLabel: Record<string, string> = {
  THO: 'Phần Thô',
  SON: 'Sơn',
  CUA: 'Cửa',
  NOI_THAT: 'Nội thất',
};

export const contractTypeLabel: Record<string, string> = {
  THO_VA_NHAN_CONG_HOAN_THIEN: 'Phần thô và nhân công hoàn thiện',
  TRON_GOI_A_Z: 'Trọn gói từ A đến Z',
  CAI_TAO: 'Nhà cải tạo',
  CHUNG_CU: 'Nhà chung cư',
  NHAN_CONG: 'Gói nhân công (chủ nhà kiểm soát vật tư)',
};
