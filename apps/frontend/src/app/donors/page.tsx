'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { formatDateNumeric } from '@/lib/format';
import type { Donation, Donor } from '@/types';

const ROWS_PER_PAGE = 10;
const SORT_OPTIONS = ['# of Projects', 'Last Donated'];

/**
 * `GET /donors` returns the bare donor row, so the two aggregate columns the
 * design calls for are derived here from the donations list rather than added
 * to the endpoint.
 */
interface DonorRow extends Donor {
  num_projects: number;
  last_donation: string | null;
}

export default function DonorsPage() {
  const api = useApi();
  const { isAdmin } = useAuth();

  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<string>('');
  const [showSort, setShowSort] = useState(false);
  const [selectedSort, setSelectedSort] = useState<string>('');

  const [showNewDonor, setShowNewDonor] = useState(false);
  const [newOrganization, setNewOrganization] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [orgError, setOrgError] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [donorToDelete, setDonorToDelete] = useState<DonorRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [donorRes, donationRes] = await Promise.all([
        api.get<{ data: Donor[] }>('/donors'),
        api.get<{ data: Donation[] }>('/donors/donations'),
      ]);
      setDonors(donorRes.data ?? []);
      setDonations(donationRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load donors');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: DonorRow[] = useMemo(() => {
    const byDonor = new Map<number, Donation[]>();
    for (const donation of donations) {
      const list = byDonor.get(donation.donor_id);
      if (list) list.push(donation);
      else byDonor.set(donation.donor_id, [donation]);
    }

    return donors.map((donor) => {
      const own = byDonor.get(donor.donor_id) ?? [];
      // One donation row per (donor, project) pair is enforced by a unique
      // constraint, so the donation count is also the project count.
      const latest = own.reduce<string | null>((newest, donation) => {
        if (!donation.donated_at) return newest;
        if (!newest || donation.donated_at > newest) return donation.donated_at;
        return newest;
      }, null);

      return {
        ...donor,
        num_projects: own.length,
        last_donation: latest,
      };
    });
  }, [donors, donations]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let matching = query
      ? rows.filter(
          (row) =>
            row.organization.toLowerCase().includes(query) ||
            (row.contact_name ?? '').toLowerCase().includes(query) ||
            (row.contact_email ?? '').toLowerCase().includes(query),
        )
      : rows;

    if (selectedDonor) {
      matching = matching.filter((row) => String(row.donor_id) === selectedDonor);
    }

    if (selectedSort === '# of Projects') {
      return [...matching].sort((a, b) => b.num_projects - a.num_projects);
    }
    if (selectedSort === 'Last Donated') {
      return [...matching].sort((a, b) =>
        (b.last_donation ?? '').localeCompare(a.last_donation ?? ''),
      );
    }
    return matching;
  }, [rows, search, selectedDonor, selectedSort]);

  const donorOptions = donors.map((d) => ({
    label: d.organization,
    value: String(d.donor_id),
  }));

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const currentDonors = filtered.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  );

  const columns: DataTableColumn<DonorRow>[] = [
    {
      key: 'id',
      header: 'Donor ID',
      width: '15%',
      cell: (donor) => `#${String(donor.donor_id).padStart(6, '0')}`,
      skeleton: { width: '80%' },
    },
    {
      key: 'organization',
      header: 'Donor Name',
      width: isAdmin ? '47%' : '55%',
      cell: (donor) => donor.organization,
    },
    {
      key: 'projects',
      header: '# of Projects',
      width: '15%',
      cell: (donor) => donor.num_projects,
      skeleton: { width: '35%' },
    },
    {
      key: 'last_donation',
      header: 'Last Donation',
      width: '15%',
      cell: (donor) => formatDateNumeric(donor.last_donation) || '—',
      skeleton: { width: '70%' },
    },
    // Deleting a donor is admin-only on the backend (`donors/handler.ts`).
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '',
            width: '56px',
            align: 'center' as const,
            cell: (donor: DonorRow) => (
              <RowDeleteButton
                label={`Delete ${donor.organization}`}
                onClick={() => setDonorToDelete(donor)}
              />
            ),
            skeleton: { width: '32px' },
          },
        ]
      : []),
  ];

  const resetNewDonor = () => {
    setNewOrganization('');
    setNewContactName('');
    setNewContactEmail('');
    setOrgError(false);
    setNameError(false);
    setEmailError(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    const hasOrgError = !newOrganization.trim();
    const hasNameError = !newContactName.trim();
    const hasEmailError = !newContactEmail.trim();

    setOrgError(hasOrgError);
    setNameError(hasNameError);
    setEmailError(hasEmailError);

    if (hasOrgError || hasNameError || hasEmailError) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Previously this only closed the dialog, so nothing was ever persisted.
      await api.post('/donors', {
        organization: newOrganization.trim(),
        contact_name: newContactName.trim(),
        contact_email: newContactEmail.trim(),
      });
      setShowNewDonor(false);
      resetNewDonor();
      await load();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not add donor. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />
        <div className="!m-[2%] flex min-h-[90vh] flex-col">
          <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">
            Donors
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
                  Filter By
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
              <Button icon={<FaPlus aria-hidden />} onClick={() => setShowNewDonor(true)}>
                New Donor
              </Button>
            </HStack>
          </HStack>

          <Dialog.Root
            open={showNewDonor}
            onOpenChange={(e) => {
              if (!e.open && !saving) {
                setShowNewDonor(false);
                resetNewDonor();
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
                      Add New Donor
                    </Dialog.Title>
                    <CloseButton onClick={() => setShowNewDonor(false)} disabled={saving} />
                  </Dialog.Header>
                  <Dialog.Body>
                    <Stack gap={4}>
                      <TextInputField
                        label="Organization Name*"
                        placeholder="Organization name"
                        value={newOrganization}
                        onChange={(val) => {
                          setNewOrganization(val);
                          setOrgError(false);
                        }}
                        isError={orgError}
                        errorMessage="Enter valid name"
                        disabled={saving}
                      />
                      <TextInputField
                        label="Contact Name*"
                        placeholder="Contact name"
                        value={newContactName}
                        onChange={(val) => {
                          setNewContactName(val);
                          setNameError(false);
                        }}
                        isError={nameError}
                        errorMessage="Enter valid name"
                        disabled={saving}
                      />
                      <TextInputField
                        label="Contact Email*"
                        placeholder="Contact email"
                        value={newContactEmail}
                        onChange={(val) => {
                          setNewContactEmail(val);
                          setEmailError(false);
                        }}
                        isError={emailError}
                        errorMessage="Enter valid email"
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
                        setShowNewDonor(false);
                        resetNewDonor();
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSave} isLoading={saving} loadingText="Saving…">
                      Add Donor
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
              rows={currentDonors}
              rowKey={(donor) => donor.donor_id}
              isLoading={loading}
              loadingLabel="Loading donors…"
              skeletonRows={ROWS_PER_PAGE}
              emptyMessage="No donors found."
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
          open={donorToDelete !== null}
          onClose={() => setDonorToDelete(null)}
          onConfirm={async () => {
            if (!donorToDelete) return;
            await api.del(`/donors/${donorToDelete.donor_id}`);
            await load();
          }}
          title="Delete Donor"
          itemName={donorToDelete?.organization}
          confirmLabel="Delete Donor"
          consequences={
            donorToDelete && donorToDelete.num_projects > 0 ? (
              <p>
                This also deletes their {donorToDelete.num_projects} recorded
                donation{donorToDelete.num_projects === 1 ? '' : 's'}, which will
                no longer count toward those projects&apos; funding.
              </p>
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
