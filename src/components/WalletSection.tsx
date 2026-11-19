/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wallet,
  Zap,
  CreditCard,
  Smartphone,
  CheckCircle,
  Clock,
  Upload,
  AlertCircle,
  Copy,
  Check,
  Building,
  Loader2,
} from 'lucide-react';
import { UserProfile, PaymentRequest, PlatformSettings, PaymentMethodItem } from '../types';
import { platformDB } from '../lib/storage';
import { generateUuid } from '../lib/supabase';
import {
  useLanguage,
  getPaymentMethodFallbackLabel,
} from '../lib/translations';
import { Modal } from './Modal';

interface WalletSectionProps {
  currentUser: UserProfile | null;
  settings: PlatformSettings;
  onOpenAuth: () => void;
  onBalanceUpdated: () => void;
}

export const WalletSection: React.FC<WalletSectionProps> = ({
  currentUser,
  onOpenAuth,
  onBalanceUpdated,
}) => {
  const { lang, locale, t } = useLanguage();
  const [codeInputValue, setCodeInputValue] = useState('');
  const [isRedeemingCode, setIsRedeemingCode] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  const activePaymentMethods = platformDB.getActivePaymentMethods();

  // Upload receipt modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [payMethod, setPayMethod] = useState<string>(() => activePaymentMethods[0]?.id || 'vodafone_cash');
  const [payAmount, setPayAmount] = useState('100');
  const [refNumber, setRefNumber] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    if (!codeInputValue.trim() || isRedeemingCode) return;

    setIsRedeemingCode(true);
    setRedeemFeedback(null);
    try {
      const res = await platformDB.redeemCodeForUserAsync(codeInputValue.trim(), currentUser.id);
      setRedeemFeedback(res);
      if (res.success) {
        setCodeInputValue('');
        onBalanceUpdated();
      }
    } finally {
      setIsRedeemingCode(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaymentError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 960;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            setReceiptImage(canvas.toDataURL('image/jpeg', 0.72));
            return;
          }
        } catch {
          // Fallback to raw data URL if canvas resize fails
        }
        setReceiptImage(rawDataUrl);
      };
      img.onerror = () => setReceiptImage(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }

    const numericAmount = parseFloat(payAmount);
    if (!numericAmount || numericAmount <= 0) {
      setPaymentError(t.wallet.errInvalidAmount);
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    try {
      const resolvedMethod = activePaymentMethods.find((m) => m.id === payMethod);
      const newReq: PaymentRequest = {
        id: generateUuid(),
        studentId: currentUser.id,
        studentName: currentUser.fullName,
        studentPhone: currentUser.phone,
        studentCode: currentUser.studentCode,
        method: payMethod,
        methodLabel: resolvedMethod?.name || platformDB.getPaymentMethodLabel(payMethod),
        amount: numericAmount,
        receiptImage: receiptImage || undefined,
        referenceNumber: refNumber.trim() || `REF-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        notes: t.wallet.pendingTeacherNote,
        createdAt: new Date().toISOString(),
      };

      const { supabaseResult } = await platformDB.addPaymentRequestAsync(newReq);
      if (!supabaseResult.success) {
        setPaymentError(
          supabaseResult.error || t.wallet.reqSaveError
        );
        return;
      }

      setUploadSuccess(true);
      onBalanceUpdated();
      setTimeout(() => {
        setUploadSuccess(false);
        setShowUploadModal(false);
        setReceiptImage('');
        setRefNumber('');
        onBalanceUpdated();
      }, 1800);
    } catch (err: any) {
      setPaymentError(err?.message || t.wallet.errSubmitPayment);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const studentPayments = platformDB
    .getPayments()
    .filter(
      (p) =>
        p.studentId === currentUser?.id ||
        (currentUser?.phone && p.studentPhone === currentUser.phone) ||
        (currentUser?.studentCode && p.studentCode === currentUser.studentCode)
    );

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 1. Main Wallet Balance Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-50 via-white to-blue-50 dark:from-slate-900 dark:via-[#131F37] dark:to-slate-900 border border-amber-500/30 p-8 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-xl">
          <Wallet className="w-8 h-8" />
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1">
          {t.wallet.eWalletBadge}
        </span>

        <div className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
          {t.wallet.availableBalancePrefix}{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-amber-500 via-amber-600 to-amber-500 dark:from-amber-400 dark:via-amber-300 dark:to-amber-500">
            {currentUser?.balance || 0}
          </span>{' '}
          <span className="text-lg font-normal text-slate-500 dark:text-slate-400">{t.common.currency}</span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 max-w-md mx-auto">
          {t.wallet.walletDesc}
        </p>

        {!currentUser && (
          <div className="mt-4">
            <button
              onClick={onOpenAuth}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              {t.wallet.signInManageBtn}
            </button>
          </div>
        )}
      </div>

      {/* 2. Instant Redeem Code Card */}
      <div className="bg-white dark:bg-[#0F172A] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {t.wallet.instantCardTitle}
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {t.wallet.instantCardDescBefore}{' '}
          <strong dir="ltr" className="text-amber-600 dark:text-amber-400 font-mono select-all">ENG-100</strong>{' '}
          {t.common.or.toLowerCase()}{' '}
          <strong dir="ltr" className="text-amber-600 dark:text-amber-400 font-mono select-all">WELCOME-2026</strong>)
        </p>

        <form onSubmit={handleRedeemCode} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            dir="ltr"
            value={codeInputValue}
            onChange={(e) => setCodeInputValue(e.target.value)}
            placeholder={t.wallet.instantCardPlaceholder}
            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl px-4 py-3.5 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 shadow-inner"
          />
          <button
            type="submit"
            disabled={isRedeemingCode}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isRedeemingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}
            <span>{isRedeemingCode ? t.wallet.redeemingBtn : t.wallet.activateTopUpBtn}</span>
          </button>
        </form>

        {redeemFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              redeemFeedback.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
            }`}
          >
            {redeemFeedback.message}
          </div>
        )}
      </div>

      {/* 3. Official Dynamic Payment Methods Cards */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{t.wallet.officialMethodsTitle}</h3>
          </div>

          {activePaymentMethods.length > 0 && (
            <button
              onClick={() => {
                if (!currentUser) onOpenAuth();
                else {
                  if (!activePaymentMethods.some((m) => m.id === payMethod) && activePaymentMethods[0]) {
                    setPayMethod(activePaymentMethods[0].id);
                  }
                  setShowUploadModal(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{t.wallet.uploadReceiptBtn}</span>
            </button>
          )}
        </div>

        {activePaymentMethods.length === 0 ? (
          <div className="p-6 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            {t.wallet.noMethodsEnabled}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {activePaymentMethods.map((method: PaymentMethodItem) => {
              const colorClass =
                method.accentColor === 'red'
                  ? 'text-red-600 dark:text-red-400 bg-red-500/10'
                  : method.accentColor === 'purple'
                  ? 'text-purple-600 dark:text-purple-400 bg-purple-500/10'
                  : method.accentColor === 'blue'
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10'
                  : method.accentColor === 'emerald'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  : 'text-amber-600 dark:text-amber-400 bg-amber-500/10';
              const iconColorClass =
                method.accentColor === 'red'
                  ? 'text-red-600 dark:text-red-400'
                  : method.accentColor === 'purple'
                  ? 'text-purple-600 dark:text-purple-400'
                  : method.accentColor === 'blue'
                  ? 'text-blue-600 dark:text-blue-400'
                  : method.accentColor === 'emerald'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400';

              const MethodIcon =
                method.iconType === 'phone'
                  ? Smartphone
                  : method.iconType === 'zap'
                  ? Zap
                  : method.iconType === 'building'
                  ? Building
                  : method.iconType === 'wallet'
                  ? Wallet
                  : CreditCard;

              return (
                <div
                  key={method.id}
                  className="p-5 rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 shadow-xl space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${colorClass}`}>
                      {getPaymentMethodFallbackLabel(method.id, method.name, t, lang)}
                    </span>
                    <MethodIcon className={`w-5 h-5 shrink-0 ${iconColorClass}`} />
                  </div>

                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 gap-2">
                    <span dir="ltr" className="truncate">{method.accountValue}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(method.accountValue, method.id)}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0 cursor-pointer"
                      title={t.wallet.copyDetailsTitle}
                    >
                      {copiedKey === method.id ? (
                        <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {method.instructions && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {method.instructions}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Previous Transactions History */}
      <div className="bg-white dark:bg-[#0F172A] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>{t.wallet.txHistoryTitle}</span>
        </h3>

        {studentPayments.length === 0 ? (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 py-6">{t.wallet.noTxHistory}</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {studentPayments.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{p.amount} {t.common.currency}</span>
                    <span dir="ltr" className="text-slate-500 dark:text-slate-400 font-mono">({p.referenceNumber})</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {getPaymentMethodFallbackLabel(p.method, p.methodLabel, t, lang)} • {new Date(p.createdAt).toLocaleDateString(locale)}
                  </span>
                </div>

                <div>
                  {p.status === 'approved' ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20">
                      {t.wallet.confirmedCredited}
                    </span>
                  ) : p.status === 'rejected' ? (
                    <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20">
                      {t.wallet.statusRejected}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/20 animate-pulse">
                      {t.wallet.underReview20Mins}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Upload Receipt */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => !isSubmittingPayment && setShowUploadModal(false)}
        closeDisabled={isSubmittingPayment}
        maxWidthClass="max-w-md"
        panelClassName="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700"
        headerClassName="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        bodyClassName="p-5 sm:p-6 space-y-4"
        headerContent={
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {t.wallet.uploadModalTitle}
            </h3>
          </div>
        }
      >
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t.wallet.uploadModalDesc}
            </p>

            {uploadSuccess ? (
              <div className="p-6 text-center space-y-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                <CheckCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400 mx-auto" />
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{t.wallet.receiptSubmittedTitle}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">{t.wallet.receiptSubmittedDesc}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReceipt} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.wallet.transferMethodLabel}</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                  >
                    {activePaymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {getPaymentMethodFallbackLabel(m.id, m.name, t, lang)} ({m.accountValue})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.wallet.amountShortLabel}</label>
                    <input
                      type="number"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.wallet.refShortLabel}</label>
                    <input
                      type="text"
                      value={refNumber}
                      onChange={(e) => setRefNumber(e.target.value)}
                      placeholder={t.wallet.refShortPlaceholder}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.wallet.receiptImageLabel}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full text-xs text-slate-500 dark:text-slate-400 file:me-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 cursor-pointer"
                  />
                  {receiptImage && (
                    <div className="mt-2 w-28 h-28 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
                      <img src={receiptImage} alt="Receipt" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                {paymentError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{paymentError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isSubmittingPayment}
                    onClick={() => setShowUploadModal(false)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-xs font-bold shadow-lg flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmittingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{isSubmittingPayment ? t.wallet.submittingTransferBtn : t.wallet.confirmSubmitReceipt}</span>
                  </button>
                </div>
              </form>
            )}
      </Modal>
    </div>
  );
};
