/**
 * Thầu phụ chỉ thao tác trên hạng mục được gán. Riêng đội trưởng (có teamType) mời không kèm hạng
 * mục — như màn Mời thành viên (mockup 07) — thì phụ trách toàn dự án.
 */
export function phaseInScope(
  member: { role: string; teamType?: string | null; assignedPhaseCodes: string[] },
  phaseCode: string,
): boolean {
  if (member.role !== 'SUB_CONTRACTOR') return true;
  if (member.teamType && member.assignedPhaseCodes.length === 0) return true;
  return member.assignedPhaseCodes.includes(phaseCode);
}
