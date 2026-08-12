'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, Portal, CloseButton } from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import {
  getExpenditure,
  getReceiptDownloadUrl,
  reviewExpenditure,
} from '@/lib/expenditures';
import {
  EXPENDITURE_STATUSES,
  type ExpenditureDetail,
  type ExpenditureStatus,
} from '@/types';
import StatusBadge from './StatusBadge';

interface ReviewExpenseModalProps {
  expenditureId: number | null;
  open: boolean;
  onClose: () => void;
  onReviewed: () => void;
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 700,
  fontSize: '16px',
  color: 'var(--color-core-black)',
};

const VALUE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '16px',
  color: 'var(--color-core-black)',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <span style={{ ...LABEL_STYLE, flex: '0 0 8.5rem', maxWidth: '45%' }}>{label}</span>
      <span style={{ ...VALUE_STYLE, flex: 1 }}>{children}</span>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '---';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ReviewExpenseModal({
  expenditureId,
  open,
  onClose,
  onReviewed,
}: ReviewExpenseModalProps) {
  const { isAdmin } = useAuth();

  const [detail, setDetail] = useState<ExpenditureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decision, setDecision] = useState<ExpenditureStatus | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [decisionError, setDecisionError] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || expenditureId === null) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setDecisionError(false);
    setNotesError(false);

    getExpenditure(expenditureId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDecision(data.status);
        setAdminNotes(data.adminNotes ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load expense');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, expenditureId]);

  async function openReceipt() {
    if (expenditureId === null) return;
    try {
      const { downloadUrl } = await getReceiptDownloadUrl(expenditureId);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to open receipt');
    }
  }

  async function handleSave() {
    if (expenditureId === null) return;

    const hasDecisionError = decision === null;
    const hasNotesError = !adminNotes.trim();
    setDecisionError(hasDecisionError);
    setNotesError(hasNotesError);
    if (hasDecisionError || hasNotesError) return;

    setSaving(true);
    setSaveError(null);
    try {
      await reviewExpenditure(expenditureId, decision, adminNotes.trim());
      onReviewed();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose(); }}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* 485px is the Figma width; it shrinks with the viewport below that. */}
          <Dialog.Content width="100%" maxWidth="485px" marginX="4">
            <Dialog.Header
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              backgroundColor="var(--color-black-100)"
            >
              <Dialog.Title
                fontFamily="var(--font-heading)"
                fontSize="var(--font-size-heading-3)"
                fontWeight={600}
              >
                Review Expense
              </Dialog.Title>
              <CloseButton onClick={onClose} />
            </Dialog.Header>

            <Dialog.Body>
              {loading && <p>Loading expense...</p>}
              {loadError && <p style={{ color: 'var(--color-error-red)' }}>{loadError}</p>}

              {!loading && !loadError && detail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <Row label="Date:">{formatDate(detail.spent_on)}</Row>
                  <Row label="Expense Type:">{detail.category ?? '---'}</Row>
                  <Row label="Submitted By:">{detail.submittedByName ?? '---'}</Row>
                  <Row label="Description:">{detail.description ?? '---'}</Row>
                  <Row label="Amount:">
                    ${parseFloat(detail.amount).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </Row>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={LABEL_STYLE}>View Receipt:</span>
                    {detail.receiptUrl ? (
                      <div
                        style={{
                          border: '1px solid var(--color-black-400)',
                          borderRadius: '4px',
                          padding: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontWeight: 700,
                            fontSize: 'var(--font-size-callout)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                        >
                          {detail.receiptUrl.split('/').pop()}
                        </span>
                        <span style={{ display: 'flex', gap: '24px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={openReceipt}
                            style={{
                              color: 'var(--color-core-green)',
                              fontWeight: 700,
                              fontSize: '14px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            view pdf
                          </button>
                          <button
                            type="button"
                            onClick={openReceipt}
                            style={{
                              color: 'var(--color-core-green)',
                              fontWeight: 700,
                              fontSize: '14px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            download
                          </button>
                        </span>
                      </div>
                    ) : (
                      <span style={VALUE_STYLE}>---</span>
                    )}
                  </div>

                  {/* Admin decision and notes are admin-only; everyone else sees
                      the expense read-only. */}
                  {isAdmin ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={LABEL_STYLE}>Admin Decision*</span>
                        <div style={{ display: 'flex', gap: '20px' }}>
                          {EXPENDITURE_STATUSES.map((status) => (
                            <StatusBadge
                              key={status}
                              status={status}
                              selected={decision === status}
                              onClick={() => {
                                setDecision(status);
                                setDecisionError(false);
                              }}
                            />
                          ))}
                        </div>
                        {decisionError && (
                          <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                            Select a decision
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={VALUE_STYLE} htmlFor="admin-notes">Admin Notes*</label>
                        <textarea
                          id="admin-notes"
                          value={adminNotes}
                          onChange={(e) => {
                            setAdminNotes(e.target.value);
                            setNotesError(false);
                          }}
                          placeholder="Placeholder"
                          rows={4}
                          style={{
                            border: `1px solid ${notesError ? 'var(--color-error-red)' : 'var(--color-black-400)'}`,
                            borderRadius: '4px',
                            padding: '8px 12px',
                            fontSize: '16px',
                            outline: 'none',
                            width: '100%',
                            fontFamily: 'var(--font-body)',
                            resize: 'vertical',
                          }}
                        />
                        {notesError && (
                          <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>
                            Enter admin notes
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <Row label="Status:">
                      <StatusBadge status={detail.status} />
                    </Row>
                  )}

                  {saveError && (
                    <p style={{ color: 'var(--color-error-red)', fontSize: '14px' }}>{saveError}</p>
                  )}
                </div>
              )}
            </Dialog.Body>

            <Dialog.Footer backgroundColor="var(--color-black-100)">
              <Button variant="outline" borderColor="var(--color-black-500)" onClick={onClose}>
                Cancel
              </Button>
              {isAdmin && (
                <Button
                  backgroundColor="var(--color-primary-500)"
                  color="var(--color-core-white)"
                  disabled={saving || loading || !detail}
                  onClick={handleSave}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
