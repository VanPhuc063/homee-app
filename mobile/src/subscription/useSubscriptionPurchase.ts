import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useIAP } from 'react-native-iap';
import { useRouter } from 'expo-router';
import { api } from '@/api/client';
import type { PlanDef, SubscriptionPlanId, SubscriptionStatus } from '@/types';

/** Dùng chung cho các màn bảng giá: tải gói, trạng thái hiện tại, và luồng mua qua IAP. */
export function useSubscriptionPurchase() {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api<Record<SubscriptionPlanId, PlanDef>>('/me/subscription/plans'),
  });

  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubscriptionStatus>('/me/subscription'),
  });

  const verify = useMutation({
    mutationFn: (p: { productId: string; transactionId: string; purchaseToken?: string }) =>
      api('/me/subscription/verify', {
        method: 'POST',
        body: { platform: Platform.OS === 'ios' ? 'ios' : 'android', ...p },
      }),
  });

  const planIdByProductId = (productId: string): SubscriptionPlanId | undefined =>
    plans && (Object.keys(plans) as SubscriptionPlanId[]).find((id) => plans[id].productId === productId);

  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    // Mọi giao dịch đều xác thực lại với backend TRƯỚC khi finishTransaction — không tin trạng thái
    // local của IAP. Thành công thì sang màn biên lai.
    onPurchaseSuccess: async (purchase) => {
      const transactionId =
        Platform.OS === 'ios' ? (purchase as { transactionId: string }).transactionId : purchase.id;
      try {
        await verify.mutateAsync({
          productId: purchase.productId,
          transactionId,
          purchaseToken: purchase.purchaseToken ?? undefined,
        });
        qc.invalidateQueries({ queryKey: ['subscription-status'] });
        const planId = planIdByProductId(purchase.productId);
        router.replace({ pathname: '/subscription/success', params: { planId: planId ?? '', txn: transactionId } });
      } catch (e) {
        Alert.alert('Xác thực giao dịch thất bại', (e as Error).message);
      } finally {
        await finishTransaction({ purchase, isConsumable: false });
      }
    },
    onPurchaseError: (error) => {
      if (error.code !== 'user-cancelled') Alert.alert('Mua thất bại', error.message);
    },
  });

  // Nạp giá/offer thật từ store khi đã kết nối IAP. Product ID là placeholder cho tới khi tạo sản
  // phẩm thật trên store (xem IAP_SETUP.md) — chưa có thì nút Mua vẫn hiện nhưng bấm sẽ báo lỗi.
  useEffect(() => {
    if (!connected || !plans) return;
    const all = Object.values(plans);
    const subSkus = all.filter((p) => p.kind === 'SUBSCRIPTION').map((p) => p.productId);
    const oneTimeSkus = all.filter((p) => p.kind === 'ONE_TIME').map((p) => p.productId);
    if (subSkus.length) fetchProducts({ skus: subSkus, type: 'subs' });
    if (oneTimeSkus.length) fetchProducts({ skus: oneTimeSkus, type: 'in-app' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, plans]);

  const buy = async (def: PlanDef) => {
    if (def.kind === 'SUBSCRIPTION') {
      const sub = subscriptions.find((s) => s.id === def.productId) as
        | { subscriptionOffers?: { offerTokenAndroid?: string | null }[] }
        | undefined;
      const offerToken = sub?.subscriptionOffers?.[0]?.offerTokenAndroid ?? undefined;
      if (Platform.OS === 'android' && !offerToken) {
        Alert.alert('Chưa sẵn sàng', 'Chưa tải được thông tin gói từ Google Play, thử lại sau.');
        return;
      }
      await requestPurchase({
        request: {
          apple: { sku: def.productId },
          google: {
            skus: [def.productId],
            subscriptionOffers: offerToken ? [{ sku: def.productId, offerToken }] : undefined,
          },
        },
        type: 'subs',
      });
    } else {
      await requestPurchase({
        request: { apple: { sku: def.productId }, google: { skus: [def.productId] } },
        type: 'in-app',
      });
    }
  };

  return { plans, plansLoading, status, connected, buy, verifying: verify.isPending };
}
