/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../lib/translations';

export interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerContent?: React.ReactNode;
  headerActions?: React.ReactNode;
  tabs?: React.ReactNode;
  subHeader?: React.ReactNode;
  footer?: React.ReactNode;
  floatingContent?: React.ReactNode;
  children: React.ReactNode;
  maxWidthClass?: string;
  overlayClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeButtonClassName?: string;
  closeButtonAriaLabel?: string;
  closeButtonTitle?: string;
  closeDisabled?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  isFullscreen?: boolean;
  hideHeader?: boolean;
  hideCloseButton?: boolean;
  disableBodyScroll?: boolean;
  ariaLabel?: string;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onPanelMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  onPanelClick?: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerContent,
  headerActions,
  tabs,
  subHeader,
  footer,
  floatingContent,
  children,
  maxWidthClass = 'max-w-lg',
  overlayClassName = 'z-50 bg-slate-950/75 dark:bg-black/80 backdrop-blur-md',
  panelClassName = 'bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700',
  headerClassName = 'px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800',
  bodyClassName = 'p-4 sm:p-6',
  footerClassName = 'px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800',
  closeButtonClassName = 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
  closeButtonAriaLabel,
  closeButtonTitle,
  closeDisabled = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  isFullscreen = false,
  hideHeader = false,
  hideCloseButton = false,
  disableBodyScroll = false,
  ariaLabel,
  panelRef,
  scrollRef,
  onPanelMouseMove,
  onPanelClick,
  onContextMenu,
}) => {
  const { t } = useLanguage();
  const resolvedCloseAria = closeButtonAriaLabel || t.app.closeModalAria;
  const resolvedCloseTitle = closeButtonTitle || t.app.closeModalEscTitle;
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose || closeDisabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose, closeDisabled]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdropClick && onClose && !closeDisabled) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={handleBackdropClick}
      onContextMenu={onContextMenu}
      className={`fixed inset-0 flex items-center justify-center animate-in fade-in ${
        isFullscreen
          ? 'p-0'
          : 'p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      } ${overlayClassName}`}
    >
      <div
        ref={panelRef}
        onMouseMove={onPanelMouseMove}
        onClick={(e) => {
          e.stopPropagation();
          onPanelClick?.(e);
        }}
        className={`relative w-full flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'fixed inset-0 w-[100dvw] h-[100dvh] max-w-none max-h-[100dvh] rounded-none border-0 shadow-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
            : `${maxWidthClass} max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl sm:rounded-3xl shadow-2xl`
        } ${panelClassName}`}
      >
        {floatingContent}

        {/* Pinned Header (Always visible & never scrolls away) */}
        {!hideHeader && (
          <div
            className={`shrink-0 flex items-center justify-between gap-2 sm:gap-3 ${headerClassName}`}
          >
            <div className="min-w-0 flex-1">
              {headerContent ? (
                headerContent
              ) : (
                <div className="min-w-0">
                  {title && (
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {headerActions}
              {!hideCloseButton && onClose && (
                <button
                  type="button"
                  disabled={closeDisabled}
                  aria-label={resolvedCloseAria}
                  title={resolvedCloseTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!closeDisabled) onClose();
                  }}
                  className={`shrink-0 min-w-[40px] min-h-[40px] p-2 rounded-xl flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 ${closeButtonClassName}`}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Optional Horizontal Scrollable Tabs Strip */}
        {tabs && (
          <div className="shrink-0 overflow-x-auto no-scrollbar">
            {tabs}
          </div>
        )}

        {/* Optional Sub-Header / Notice / Search Bar */}
        {subHeader && (
          <div className="shrink-0">
            {subHeader}
          </div>
        )}

        {/* Scrollable Content Area (Only this region scrolls vertically) */}
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 ${
            disableBodyScroll ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'
          } ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Optional Pinned Footer */}
        {footer && (
          <div className={`shrink-0 ${footerClassName}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
