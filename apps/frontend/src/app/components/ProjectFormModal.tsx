'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseButton, Dialog, Portal } from '@chakra-ui/react';
import Button from './Button';
import TextInputField from './TextInputField';
import DatePickerField from './DatePickerField';
import StaffPicker from './StaffPicker';
import { useApi } from '@/hooks/useApi';
import { ADMIN_MEMBER_ROLE } from '@/types';
import type {
  AssignableStaff,
  Member,
  MemberAssignment,
  Project,
} from '@/types';

export interface ProjectFormValues {
  name: string;
  description: string;
  budget: string;
  startDate: string;
  endDate: string;
  inProgress: boolean;
  members: MemberAssignment[];
}

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save, with the persisted project. */
  onSaved: (project: Project) => void;
  /** Absent for "Add New Project"; present switches the modal to edit mode. */
  project?: Project | null;
  members?: Member[];
}

type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

/** The design tints the header and footer with Core Black/100 at 50%. */
const CHROME_BG =
  'color-mix(in srgb, var(--color-black-100) 50%, var(--color-core-white))';

const EMPTY_VALUES: ProjectFormValues = {
  name: '',
  description: '',
  budget: '',
  startDate: '',
  endDate: '',
  inProgress: false,
  members: [],
};

/** Strips `$` and thousands separators so `$30,000` is accepted as typed. */
function parseBudget(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Error copy is taken verbatim from the design's error-state frame. */
function validate(values: ProjectFormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.name.trim()) errors.name = 'Enter a valid name';
  if (!values.description.trim())
    errors.description = 'Please enter a valid description';

  const budget = parseBudget(values.budget);
  if (!values.budget.trim() || budget === null || budget < 0) {
    errors.budget = 'Enter a valid amount';
  }

  if (!values.startDate) errors.startDate = 'Please select a valid date';

  // The "in progress" checkbox is what makes an end date optional, so the two
  // are validated together rather than independently.
  if (!values.inProgress) {
    if (
      !values.endDate ||
      (values.startDate && values.endDate < values.startDate)
    ) {
      errors.endDate = 'Please select a date AFTER the start date';
    }
  }

  if (values.members.length === 0) {
    errors.members = 'Select AT LEAST 1 staff member for the project';
  }

  return errors;
}

export default function ProjectFormModal({
  open,
  onClose,
  onSaved,
  project = null,
  members = [],
}: ProjectFormModalProps) {
  const api = useApi();
  const isEdit = Boolean(project);

  const [values, setValues] = useState<ProjectFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Errors stay hidden until the first submit: flagging "required" on a field
  // the user has not reached yet reads as failure rather than guidance.
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Re-seed whenever the modal opens so a cancelled edit does not leak into
  // the next one. This deliberately runs on the rising edge of `open` only:
  // `project` and `members` are usually fresh literals from the parent, so
  // reacting to their identity would re-seed on every render and clobber the
  // user's in-progress edits (including the post-submit error state).
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    seeded.current = true;

    setSubmitted(false);
    setSaveError(null);
    setErrors({});
    setValues(
      project
        ? {
            name: project.name ?? '',
            description: project.description ?? '',
            budget:
              project.total_budget != null
                ? String(Number(project.total_budget))
                : '',
            startDate: project.start_date?.slice(0, 10) ?? '',
            endDate: project.end_date?.slice(0, 10) ?? '',
            inProgress: !project.end_date,
            members: members.flatMap((m) =>
              m.role === ADMIN_MEMBER_ROLE
                ? []
                : [{ user_id: m.user_id, role: m.role }],
            ),
          }
        : EMPTY_VALUES,
    );
  }, [open, project, members]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStaffLoading(true);
    api
      .get<{ staff: AssignableStaff[] }>('/projects/assignable-staff')
      .then((res) => {
        if (!cancelled) setStaff(res?.staff ?? []);
      })
      .catch(() => {
        // Non-fatal: the rest of the form still works, and the picker shows
        // its empty state rather than blocking the whole modal.
        if (!cancelled) setStaff([]);
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, api]);

  const update = useCallback(
    <K extends keyof ProjectFormValues>(
      key: K,
      value: ProjectFormValues[K],
    ) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        // Checking "in progress" clears the end date, which is the state the
        // backend stores for an open-ended project.
        if (key === 'inProgress' && value === true) next.endDate = '';
        return next;
      });
    },
    [],
  );

  // Re-validate live once the user has seen the errors, so a fixed field stops
  // shouting immediately.
  useEffect(() => {
    if (!submitted) return;
    setErrors(validate(values));
  }, [values, submitted]);

  async function handleSubmit() {
    const nextErrors = validate(values);
    setSubmitted(true);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSaveError(null);
    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      total_budget: parseBudget(values.budget),
      start_date: values.startDate || null,
      end_date: values.inProgress ? null : values.endDate || null,
      members: values.members,
    };

    try {
      const saved = isEdit
        ? await api.put<Project>(`/projects/${project!.project_id}`, body)
        : await api.post<Project>('/projects', body);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save project',
      );
    } finally {
      setSaving(false);
    }
  }

  const showError = (field: keyof ProjectFormValues) =>
    submitted && Boolean(errors[field]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          {/* 625px is the Figma width; it shrinks with the viewport below that. */}
          <Dialog.Content width="100%" maxWidth="625px" marginX="4">
            <Dialog.Header
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              minHeight="64px"
              paddingX="24px"
              paddingY="0"
              backgroundColor={CHROME_BG}
            >
              <Dialog.Title
                fontFamily="var(--font-heading)"
                fontSize="var(--font-size-heading-3)"
                fontWeight={600}
              >
                {isEdit ? 'Edit Project' : 'Add New Project'}
              </Dialog.Title>
              <CloseButton onClick={onClose} aria-label="Close" />
            </Dialog.Header>

            <Dialog.Body paddingX="24px" paddingTop="30px" paddingBottom="24px">
              <div className="flex flex-col !gap-[30px]">
                {/* Paired fields sit side by side from `sm` up and stack on a
                    phone, where two half-width columns would be unreadable.
                    Name gets the wider share, as in the design's 337/209 split. */}
                <div className="grid !gap-[30px] sm:grid-cols-[337fr_209fr]">
                  <TextInputField
                    label="Project Name"
                    required
                    value={values.name}
                    onChange={(v) => update('name', v)}
                    placeholder="Enter project name"
                    isError={showError('name')}
                    errorMessage={errors.name}
                    disabled={saving}
                  />
                  <TextInputField
                    label="Total Funding"
                    required
                    prefix="$"
                    inputMode="decimal"
                    value={values.budget}
                    onChange={(v) => update('budget', v)}
                    placeholder="Enter total funding"
                    isError={showError('budget')}
                    errorMessage={errors.budget}
                    disabled={saving}
                  />
                </div>

                <TextInputField
                  label="Project Description"
                  required
                  multiline
                  value={values.description}
                  onChange={(v) => update('description', v)}
                  placeholder="Enter a short project description here"
                  isError={showError('description')}
                  errorMessage={errors.description}
                  disabled={saving}
                />

                {/* The checkbox sits closer to the dates than the 30px rhythm,
                    because it qualifies the end date rather than standing alone. */}
                <div className="flex flex-col !gap-[15px]">
                  <div className="grid !gap-[30px] sm:grid-cols-2">
                    <DatePickerField
                      label="Start Date"
                      required
                      value={values.startDate}
                      onChange={(v) => update('startDate', v)}
                      isError={showError('startDate')}
                      errorMessage={errors.startDate}
                      disabled={saving}
                    />
                    <DatePickerField
                      label="End Date"
                      value={values.endDate}
                      onChange={(v) => update('endDate', v)}
                      isError={showError('endDate')}
                      errorMessage={errors.endDate}
                      disabled={saving || values.inProgress}
                    />
                  </div>

                  <label className="flex w-fit cursor-pointer items-center !gap-3">
                    <input
                      type="checkbox"
                      checked={values.inProgress}
                      onChange={(e) => update('inProgress', e.target.checked)}
                      disabled={saving}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-core-green)]"
                    />
                    <small>This project is still in progress</small>
                  </label>
                </div>

                <StaffPicker
                  label="Assigned Staff"
                  required
                  options={staff}
                  isLoading={staffLoading}
                  value={values.members}
                  onChange={(v) => update('members', v)}
                  isError={showError('members')}
                  errorMessage={errors.members}
                  disabled={saving}
                />

                {saveError && (
                  <p
                    role="alert"
                    className="!text-sm !font-bold !text-error-red"
                  >
                    {saveError}
                  </p>
                )}
              </div>
            </Dialog.Body>

            <Dialog.Footer
              height="64px"
              paddingX="24px"
              backgroundColor={CHROME_BG}
            >
              <div className="flex w-full justify-end !gap-6">
                <Button variant="secondary" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                {/* Stays enabled while invalid: submitting is how the field
                    errors are surfaced, so disabling it until the form is
                    valid would make them undiscoverable. */}
                <Button
                  onClick={handleSubmit}
                  isLoading={saving}
                  loadingText="Saving…"
                >
                  Save
                </Button>
              </div>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
