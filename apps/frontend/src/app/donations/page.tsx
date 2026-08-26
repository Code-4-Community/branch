'use client';
import React, { useCallback, useMemo, useState } from 'react';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import { HStack, Input, Dialog, Portal, CloseButton, Stack } from '@chakra-ui/react';
import TextInputField from '../components/TextInputField';
import Button from '../components/Button';
import { CiFilter } from 'react-icons/ci';
import { LuArrowDownUp } from 'react-icons/lu';
import { FaPlus } from 'react-icons/fa';
import DropdownSelector from '../components/DropdownSelector';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import RowDeleteButton from '../components/RowDeleteButton';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import Pagination from '../components/Pagination';
import { useApi } from '@/hooks/useApi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { donationsQuery, donorsQuery, projectsQuery } from '@/lib/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { GatedButton } from '../components/Permission';
import { formatCurrencyPrecise, formatDateNumeric } from '@/lib/format';
import type { Donation, Donor, Project } from '@/types';

const ROWS_PER_PAGE = 10;
const SORT_OPTIONS = ['Date', 'Amount'];

// Stable empty defaults. `?? []` hands the useMemo below a fresh array on every
// render, which recomputes the joined rows for nothing.
const NO_DONATIONS: Donation[] = [];
const NO_DONORS: Donor[] = [];
const NO_PROJECTS: Pick<Project, 'project_id' | 'name'>[] = [];

/** `GET /donors/donations` returns bare rows; names are joined in on the client. */
interface DonationRow extends Donation {
  donor_name: string;
  project_name: string;
}

export default function DonationsPage() {
  const api = useApi();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  // Client-side pagination and filtering below are unchanged — this page needs
  // server-side aggregates it does not have yet. What changed is only that the
  // three reads are cached, so returning here is free, and that `/projects` is
  // the same cache entry the navbar and every other page reads.
  const donationsList = useQuery(donationsQuery());
  const donorsList = useQuery(donorsQuery());
  const projectsList = useQuery(projectsQuery());

  const donations = donationsList.data ?? NO_DONATIONS;
  const donors = donorsList.data ?? NO_DONORS;
  const projects = projectsList.data ?? NO_PROJECTS;

  const loading =
    donationsList.isPending || donorsList.isPending || projectsList.isPending;

  const loadError =
    donationsList.error ?? donorsList.error ?? projectsList.error;
  const error = loadError
    ? loadError instanceof Error
      ? loadError.message
      : 'Failed to load donations'
    : null;

  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<string>('');
  const [showSort, setShowSort] = useState(false);
  const [selectedSort, setSelectedSort] = useState<string>('');

  const [showNewDonation, setShowNewDonation] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [dateError, setDateError] = useState(false);
  const [newDonor, setNewDonor] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [donorError, setDonorError] = useState(false);
  const [projectError, setProjectError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [donationToDelete, setDonationToDelete] = useState<DonationRow | null>(null);

  // Recording or deleting a donation changes the list and nothing else, so only
  // that key is dropped — donors and projects stay warm.
  const load = useCallback(
    () => queryClient.invalidateQueries({ queryKey: donationsQuery().queryKey }),
    [queryClient],
  );

  const rows: DonationRow[] = useMemo(() => {
    const donorNames = new Map(donors.map((d) => [d.donor_id, d.organization]));
    const projectNames = new Map(projects.map((p) => [p.project_id, p.name]));
    return donations.map((donation) => ({
      ...donation,
      donor_name: donorNames.get(donation.donor_id) ?? `#${donation.donor_id}`,
      project_name: projectNames.get(donation.project_id) ?? '—',
    }));
  }, [donations, donors, projects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let matching = query
      ? rows.filter(
          (row) =>
            row.donor_name.toLowerCase().includes(query) ||
            row.project_name.toLowerCase().includes(query),
        )
      : rows;

    if (selectedDonor) {
      matching = matching.filter((row) => String(row.donor_id) === selectedDonor);
    }

    if (selectedSort === 'Amount') {
      return [...matching].sort((a, b) => Number(b.amount) - Number(a.amount));
    }
    if (selectedSort === 'Date') {
      return [...matching].sort((a, b) =>
        (b.donated_at ?? '').localeCompare(a.donated_at ?? ''),
      );
    }
    return matching;
  }, [rows, search, selectedDonor, selectedSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const currentDonations = filtered.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  );

  const columns: DataTableColumn<DonationRow>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '15%',
      cell: (donation) => formatDateNumeric(donation.donated_at) || '—',
      skeleton: { width: '70%' },
    },
    {
      key: 'donor',
      header: 'Donor ID',
      width: '15%',
      cell: (donation) => `#${String(donation.donor_id).padStart(6, '0')}`,
      skeleton: { width: '80%' },
    },
    {
      key: 'donor_name',
      header: 'Donor',
      width: '20%',
      cell: (donation) => donation.donor_name,
    },
    {
      key: 'project',
      header: 'Project Name',
      width: '25%',
      cell: (donation) => donation.project_name,
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '15%',
      cell: (donation) => formatCurrencyPrecise(donation.amount),
      skeleton: { width: '55%' },
    },
    // Recording and removing donations is admin-only. Members still see the
    // rows for their own projects — the list is scoped server side — but with
    // no action column rather than a column of disabled buttons.
    ...(can('donations:delete')
      ? [
          {
            key: 'actions',
            header: '',
            width: '56px',
            align: 'center' as const,
            cell: (donation: DonationRow) => (
              <RowDeleteButton
                label={`Delete donation from ${donation.donor_name}`}
                onClick={() => setDonationToDelete(donation)}
              />
            ),
            skeleton: { width: '32px' },
          },
        ]
      : []),
  ];

  const resetNewDonation = () => {
    setNewDate('');
    setDateError(false);
    setNewDonor('');
    setNewProject('');
    setNewAmount('');
    setDonorError(false);
    setProjectError(false);
    setAmountError(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    const hasDateError = !newDate.trim();
    const hasDonorError = !newDonor.trim();
    const hasProjectError = !newProject.trim();
    const amount = Number(newAmount);
    const hasAmountError = !newAmount.trim() || !isFinite(amount) || amount <= 0;

    setDateError(hasDateError);
    setDonorError(hasDonorError);
    setProjectError(hasProjectError);
    setAmountError(hasAmountError);

    if (hasDateError || hasDonorError || hasProjectError || hasAmountError) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Previously this only closed the dialog, so nothing was ever persisted.
      await api.post('/donors/donations', {
        donor_id: Number(newDonor),
        project_id: Number(newProject),
        amount,
        donated_at: newDate,
      });
      setShowNewDonation(false);
      resetNewDonation();
      await load();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not add donation. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const donorOptions = donors.map((d) => ({
    label: d.organization,
    value: String(d.donor_id),
  }));
  const projectOptions = projects.map((p) => ({
    label: p.name,
    value: String(p.project_id),
  }));

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />
        <div className="!m-[2%] flex min-h-[90vh] flex-col">
          <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">
            Donations
          </h1>
          <HStack width="100%" justify="space-between" paddingTop="3%" paddingBottom="3%">
            <HStack width="30%">
              <Input
                placeholder="🔍︎ Search..."
                variant="outline"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </HStack>
            <HStack>
              <div style={{ position: 'relative' }}>
                <Button
                  variant="secondary"
                  icon={<CiFilter aria-hidden />}
                  onClick={() => setShowFilter((prev) => !prev)}
                >
                  Filter By Donor
                </Button>
                {showFilter && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={donorOptions}
                      placeholder="Filter by donor..."
                      value={selectedDonor}
                      onChange={(val: string | string[]) => {
                        setSelectedDonor(val as string);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Button
                  variant="secondary"
                  icon={<LuArrowDownUp aria-hidden />}
                  onClick={() => setShowSort((prev) => !prev)}
                >
                  Sort By
                </Button>
                {showSort && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                    <DropdownSelector
                      options={SORT_OPTIONS}
                      placeholder="Sort by..."
                      value={selectedSort}
                      onChange={(val: string | string[]) => setSelectedSort(val as string)}
                    />
                  </div>
                )}
              </div>
              <GatedButton
                action="donations:create"
                icon={<FaPlus aria-hidden />}
                onClick={() => setShowNewDonation(true)}
              >
                New Donation
              </GatedButton>
            </HStack>
          </HStack>

          <Dialog.Root
            open={showNewDonation}
            onOpenChange={(e) => {
              if (!e.open && !saving) {
                setShowNewDonation(false);
                resetNewDonation();
              }
            }}
          >
            <Portal>
              <Dialog.Backdrop />
              <Dialog.Positioner>
                <Dialog.Content>
                  <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
                    <Dialog.Title
                      fontFamily={'var(--font-heading)'}
                      fontSize={'var(--font-size-heading-3)'}
                      fontWeight={600}
                    >
                      Add New Donation
                    </Dialog.Title>
                    <CloseButton onClick={() => setShowNewDonation(false)} disabled={saving} />
                  </Dialog.Header>
                  <Dialog.Body>
                    <Stack gap={4}>
                      <div className="flex flex-col !gap-1">
                        <label
                          htmlFor="donation-date"
                          className="!text-sm !font-bold"
                        >
                          Date*
                        </label>
                        <input
                          id="donation-date"
                          type="date"
                          value={newDate}
                          disabled={saving}
                          onChange={(e) => {
                            setNewDate(e.target.value);
                            setDateError(false);
                          }}
                          className="!w-full !rounded-[6px] !border !border-solid !px-3 !py-2 !text-sm"
                          style={{
                            borderColor: dateError
                              ? 'var(--color-error-red)'
                              : 'var(--color-black-400)',
                          }}
                        />
                        {dateError && (
                          <span className="!text-xs !text-error-red">
                            Enter a valid date
                          </span>
                        )}
                      </div>
                      <DropdownSelector
                        options={donorOptions}
                        placeholder="Select a donor"
                        value={newDonor}
                        onChange={(val: string | string[]) => {
                          setNewDonor(val as string);
                          setDonorError(false);
                        }}
                      />
                      {donorError && (
                        <span className="!text-xs !text-error-red">Select a donor</span>
                      )}
                      <DropdownSelector
                        options={projectOptions}
                        placeholder="Select a project"
                        value={newProject}
                        onChange={(val: string | string[]) => {
                          setNewProject(val as string);
                          setProjectError(false);
                        }}
                      />
                      {projectError && (
                        <span className="!text-xs !text-error-red">Select a project</span>
                      )}
                      <TextInputField
                        label="Amount*"
                        placeholder="Enter the amount"
                        prefix="$"
                        inputMode="decimal"
                        value={newAmount}
                        onChange={(val) => {
                          setNewAmount(val);
                          setAmountError(false);
                        }}
                        isError={amountError}
                        errorMessage="Enter a valid amount"
                        disabled={saving}
                      />
                      {saveError && (
                        <p role="alert" className="!text-sm !font-bold !text-error-red">
                          {saveError}
                        </p>
                      )}
                    </Stack>
                  </Dialog.Body>
                  <Dialog.Footer>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowNewDonation(false);
                        resetNewDonation();
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} isLoading={saving} loadingText="Saving…">
                      Add Donation
                    </Button>
                  </Dialog.Footer>
                </Dialog.Content>
              </Dialog.Positioner>
            </Portal>
          </Dialog.Root>

          {error && (
            <p role="alert" className="!font-bold !text-error-red">
              {error}
            </p>
          )}

          {!error && (
            <DataTable
              columns={columns}
              rows={currentDonations}
              rowKey={(donation) => donation.donation_id}
              isLoading={loading}
              loadingLabel="Loading donations…"
              skeletonRows={ROWS_PER_PAGE}
              emptyMessage="No donations found."
            />
          )}

          {!loading && !error && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </div>

        <ConfirmDeleteDialog
          open={donationToDelete !== null}
          onClose={() => setDonationToDelete(null)}
          onConfirm={async () => {
            if (!donationToDelete) return;
            await api.del(`/donors/donations/${donationToDelete.donation_id}`);
            await load();
          }}
          title="Delete Donation"
          itemName={
            donationToDelete
              ? `${formatCurrencyPrecise(donationToDelete.amount)} from ${donationToDelete.donor_name}`
              : undefined
          }
          confirmLabel="Delete Donation"
          consequences={
            donationToDelete ? (
              <p>
                This reduces the recorded funding for{' '}
                {donationToDelete.project_name}.
              </p>
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
