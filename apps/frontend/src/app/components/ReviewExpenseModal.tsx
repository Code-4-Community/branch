'use client';

import { useEffect, useState } from 'react';
import { Button, Dialog, Portal, CloseButton } from '@chakra-ui/react';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getExpenditure,
  getReceiptDownloadUrl,
  reviewExpenditure,
  updateExpenditure,
  type ExpenditureEdit,
} from '@/lib/expenditures';
import {
  EXPENDITURE_STATUSES,
  type ExpenditureDetail,
  type ExpenditureStatus,
} from '@/types';
import DropdownSelector from './DropdownSelector';
import LoadingState from './LoadingState';
import StatusBadge from './StatusBadge';

/** Mirrors the picker on AddExpenseModal so an edit offers the same choices. */
const EXPENSE_CATEGORIES = ['General', 'Travel', 'Travel Foreign', 'Visitor / Honorarium'];

const INPUT_STYLE: React.CSSProperties = {
  border: '1px solid var(--color-black-400)',
  borderRadius: '4px',
  padding: '8px 12px',
  fontSize: '16px',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  width: '100%',
};

/**
 * `spent_on` arrives as an ISO timestamp; slicing the date out avoids the
 * timezone shift that `new Date(...)` then `toISOString()` introduces for
 * anyone west of UTC.
 */
function toDateInputValue(value: string | null): string {
  if (!value) return '';
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : '';
}

interface EditForm {
  spentOn: string;
  category: string;
  description: string;
  amount: string;
}

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

/** A labelled editable control, stacked rather than in Row's two columns. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={LABEL_STYLE}>{label}</span>
      {children}
      {error && (
        <span style={{ color: 'var(--color-error-red)', fontSize: '12px' }}>{error}</span>
      )}
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
  const { can, why, subject } = usePermissions();
  // Approval status and admin notes are the two fields the policy reserves for
  // admins.
  const canReview = can('expense:review');

  const [detail, setDetail] = useState<ExpenditureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decision, setDecision] = useState<ExpenditureStatus | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [decisionError, setDecisionError] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [form, setForm] = useState<EditForm>({
    spentOn: '',
    category: '',
    description: '',
    amount: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EditForm, string>>>({});

  useEffect(() => {
    if (!open || expenditureId === null) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setDecisionError(false);
    setNotesError(false);
    setFieldErrors({});

    getExpenditure(expenditureId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDecision(data.status);
        setAdminNotes(data.adminNotes ?? '');
        setForm({
          spentOn: toDateInputValue(data.spent_on),
          category: data.category ?? '',
          description: data.description ?? '',
          amount: data.amount,
        });
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

  // The policy decides, from this row, whether the viewer may revise it: the
  // author may until an admin decides it, and an admin may at any point.
  const resource = detail
    ? { projectId: detail.projectId, enteredBy: detail.enteredBy, status: detail.status }
    : null;
  const canEdit = resource !== null && can('expense:update', resource);
  // Shown only to the submitter: to anyone else "not yours" is not news.
  const editDenial =
    resource !== null && detail?.enteredBy === subject.userId
      ? why('expense:update', resource)
      : undefined;

  // A cleared amount is a pending change that cannot be sent, not an absent
  // one: Number('') is 0, so folding it into the patch would silently zero the
  // expense instead of asking for a number.
  const amountCleared = canEdit && form.amount.trim() === '';

  const patch: ExpenditureEdit = {};
  if (detail && canEdit) {
    if (!amountCleared && Number(form.amount) !== Number(detail.amount)) {
      patch.amount = Number(form.amount);
    }
    if (form.category !== (detail.category ?? '')) patch.category = form.category;
    if (form.description !== (detail.description ?? '')) patch.description = form.description;
    if (form.spentOn !== toDateInputValue(detail.spent_on)) patch.spentOn = form.spentOn;
  }
  const hasEdits = Object.keys(patch).length > 0;
  const dirty = hasEdits || amountCleared;

  function setField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  /**
   * Mirrors what PATCH /expenditures/{id} will accept, so a predictable mistake
   * is caught here rather than coming back as a 400. Scoped to the fields the
   * patch actually carries: a row that was saved without a description must
   * still be editable in the amount alone.
   */
  function editErrors(): Partial<Record<keyof EditForm, string>> {
    const errors: Partial<Record<keyof EditForm, string>> = {};
    if (amountCleared) {
      errors.amount = 'Enter an amount';
    } else if (
      patch.amount !== undefined &&
      (!Number.isFinite(patch.amount) || patch.amount < 0)
    ) {
      errors.amount = 'Enter a valid amount';
    }
    if (patch.category !== undefined && !patch.category.trim()) {
      errors.category = 'Pick an expense type';
    }
    if (patch.description !== undefined && !patch.description.trim()) {
      errors.description = 'Enter a description';
    }
    if (patch.spentOn !== undefined && !patch.spentOn) {
      errors.spentOn = 'Enter a date';
    }
    return errors;
  }

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

    const errors = dirty ? editErrors() : {};
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // An admin may arrive here with both a revision and a decision; a submitter
    // only ever with a revision.
    if (canReview) {
      const hasDecisionError = decision === null;
      const hasNotesError = !adminNotes.trim();
      setDecisionError(hasDecisionError);
      setNotesError(hasNotesError);
      if (hasDecisionError || hasNotesError) return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      // Fields first: the status route is what freezes the row, so revising
      // after deciding would be refused by the policy that just applied.
      if (hasEdits) await updateExpenditure(expenditureId, patch);
      if (canReview && decision !== null) {
        await reviewExpenditure(expenditureId, decision, adminNotes.trim());
      }
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
                {canReview ? 'Review Expense' : canEdit ? 'Edit Expense' : 'Expense'}
              </Dialog.Title>
              <CloseButton onClick={onClose} />
            </Dialog.Header>

            <Dialog.Body>
              {loading && <LoadingState label="Loading expense…" size="sm" variant="inline" />}
              {loadError && <p style={{ color: 'var(--color-error-red)' }}>{loadError}</p>}

              {!loading && !loadError && detail && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {canEdit ? (
                    <>
                      <Field label="Date*" error={fieldErrors.spentOn}>
                        <input
                          type="date"
                          aria-label="Date"
                          value={form.spentOn}
                          onChange={(e) => setField('spentOn', e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </Field>
                      <Field label="Expense Type*" error={fieldErrors.category}>
                        <DropdownSelector
                          options={EXPENSE_CATEGORIES}
                          value={form.category}
                          onChange={(value) => setField('category', value as string)}
                          placeholder="Select a type"
                        />
                      </Field>
                      <Row label="Submitted By:">{detail.submittedByName ?? '---'}</Row>
                      <Field label="Description*" error={fieldErrors.description}>
                        <textarea
                          aria-label="Description"
                          value={form.description}
                          onChange={(e) => setField('description', e.target.value)}
                          rows={3}
                          style={{ ...INPUT_STYLE, resize: 'vertical' }}
                        />
                      </Field>
                      <Field label="Amount*" error={fieldErrors.amount}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          aria-label="Amount"
                          value={form.amount}
                          onChange={(e) => setField('amount', e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
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
                      {/* The policy's own sentence, so the submitter is told why
                          their own expense has gone read-only. */}
                      {editDenial && (
                        <p style={{ ...VALUE_STYLE, color: 'var(--color-black-500)', fontSize: '14px' }}>
                          {editDenial}
                        </p>
                      )}
                    </>
                  )}

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
                  {canReview ? (
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
              {(canReview || canEdit) && (
                <Button
                  backgroundColor="var(--color-primary-500)"
                  color="var(--color-core-white)"
                  disabled={saving || loading || !detail || (!canReview && !dirty)}
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
