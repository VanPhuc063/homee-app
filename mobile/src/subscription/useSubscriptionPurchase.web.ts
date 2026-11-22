import { useQuery } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api } from '@/api/client';
import type { PlanDef, SubscriptionPlanId, SubscriptionStatus } from '@/types';

/** Web không có IAP App Store/Google Play — vẫn xem được bảng giá, mua thì hướng sang app. */
export function useSubscriptionPurchase() {
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api<Record<SubscriptionPlanId, PlanDef>>('/me/subscription/plans'),
  });
  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubscriptionStatus>('/me/subscription'),
  });
  const buy = async (_def: PlanDef) =>
    Alert.alert('Mua trên app', 'Bản web chưa hỗ trợ thanh toán. Cài app Homeee trên iOS/Android để mua gói.');
  return { plans, plansLoading, status, connected: true, buy, verifying: false };
}
