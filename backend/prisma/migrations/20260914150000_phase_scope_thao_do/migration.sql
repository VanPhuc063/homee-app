-- B-06 Tháo dỡ — chỉ áp dụng cho nhà cải tạo (contractType CAI_TAO), ngược lại với KET_CAU_THO
-- (bị bỏ qua ở CAI_TAO/CHUNG_CU). Xem templatePhaseAppliesToContract.
ALTER TYPE "PhaseScope" ADD VALUE 'THAO_DO';
