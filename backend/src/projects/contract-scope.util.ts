import { ContractType, PhaseScope } from '@prisma/client';

/** Tên template quy trình chuẩn ĐANG DÙNG — khớp `name` trong prisma/seed-data/standard-process.json
 * (xem seed.ts, upsert theo tên này). DB production có nhiều bản ProcessTemplate cũ còn sót lại
 * (VD "Quy trình thi công hoàn thiện chuẩn (XA)", vẫn được 1 số dự án cũ tham chiếu qua templateId
 * nên KHÔNG được xoá) — mọi nơi lấy "template mặc định" phải lọc theo tên này, không được dùng
 * `findFirst()` trần (thứ tự trả về không đảm bảo là bản đang dùng).
 */
export const STANDARD_TEMPLATE_NAME = 'Quy trình thi công + giám sát tích hợp';

/** Loại hợp đồng không cần hạng mục kết cấu thô (kết cấu công trình đã có sẵn) — dùng bởi
 * ProjectsService.create/getPlanOptions và ImportScheduleService.getStandardReference để cùng lọc
 * 1 danh sách hạng mục nhất quán theo contractType của dự án. */
const CONTRACT_TYPES_WITHOUT_STRUCTURE: ContractType[] = ['CAI_TAO', 'CHUNG_CU'];

/** Ngược lại với trên — chỉ nhà cải tạo mới có hiện trạng để tháo dỡ (B-03). Nhà xây mới/chung cư
 * (kết cấu tự lo từ đầu, không có gì sẵn để đập) không cần hạng mục này. */
const CONTRACT_TYPES_WITH_DEMOLITION: ContractType[] = ['CAI_TAO'];

export function templatePhaseAppliesToContract(
  phaseScope: PhaseScope,
  contractType: ContractType,
): boolean {
  if (phaseScope === 'KET_CAU_THO' && CONTRACT_TYPES_WITHOUT_STRUCTURE.includes(contractType)) {
    return false;
  }
  if (phaseScope === 'THAO_DO' && !CONTRACT_TYPES_WITH_DEMOLITION.includes(contractType)) {
    return false;
  }
  return true;
}
