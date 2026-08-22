'use client'
import React, { useEffect, useRef, useState } from 'react';
import NavBar from "../components/Navbar";
import { HStack, Input, Button, Dialog, Portal, CloseButton, Stack } from "@chakra-ui/react";
import TextInputField from '../components/TextInputField';
import { CiFilter } from "react-icons/ci";
import { LuArrowDownUp } from "react-icons/lu";
import { FaPlus } from "react-icons/fa";
import { FiDollarSign } from "react-icons/fi";
import DropdownSelector from '../components/DropdownSelector';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Pagination from '../components/Pagination';
import { useApi } from '@/hooks/useApi';

type Donation = {
    donation_id: number;
    donor_id: number;
    project_id: number;
    donor_name: string;
    project_name: string;
    amount: number;
    date: string | null;
};

/**
 * Raw shape of a row from GET /donations. Donor/project are ids, not names —
 * names are resolved against the mock arrays below, since real /donors and
 * /projects fetches are out of scope for this ticket.
 */
interface RawDonation {
    donation_id: number;
    donor_id: number;
    project_id: number;
    amount: string;
    donated_at: string;
}

const mockDonors = ['Green Future Foundation really long name htat overfloaws and we dont wan tto see it', 'Horizon Trust', 'Bright Path Nonprofit', 'Unity Giving Circle', 'Sunrise Community Fund'];
const mockProjects = ['Clean Water Initiative', 'Youth Mentorship Program', 'Food Security Drive', 'Urban Garden Project', 'STEM Education Fund'];

const mockDonations: Donation[] = [
    { donation_id: 1, donor_id: 1, project_id: 1, donor_name: mockDonors[0], project_name: mockProjects[0], date: '03/12/2024', amount: 5000 },
    { donation_id: 2, donor_id: 2, project_id: 2, donor_name: mockDonors[1], project_name: mockProjects[1], date: '01/05/2024', amount: 12000 },
    { donation_id: 3, donor_id: 3, project_id: 3, donor_name: mockDonors[2], project_name: mockProjects[2], date: '02/28/2024', amount: 750 },
    { donation_id: 4, donor_id: 4, project_id: 4, donor_name: mockDonors[3], project_name: mockProjects[3], date: '03/30/2024', amount: 3200 },
    { donation_id: 5, donor_id: 5, project_id: 5, donor_name: mockDonors[4], project_name: mockProjects[4], date: '04/01/2024', amount: 8500 },
    { donation_id: 6, donor_id: 1, project_id: 2, donor_name: mockDonors[0], project_name: mockProjects[1], date: '02/14/2024', amount: 1500 },
    { donation_id: 7, donor_id: 2, project_id: 3, donor_name: mockDonors[1], project_name: mockProjects[2], date: '01/20/2024', amount: 20000 },
    { donation_id: 8, donor_id: 3, project_id: 4, donor_name: mockDonors[2], project_name: mockProjects[3], date: '03/05/2024', amount: 9750 },
    { donation_id: 9, donor_id: 4, project_id: 5, donor_name: mockDonors[3], project_name: mockProjects[4], date: '04/10/2024', amount: 4300 },
    { donation_id: 10, donor_id: 5, project_id: 1, donor_name: mockDonors[4], project_name: mockProjects[0], date: '03/22/2024', amount: 600 },
];

const sortOptions = ['Date', 'Amount'];

const donationColumns: DataTableColumn<Donation>[] = [
    {
        key: 'date',
        header: 'Date',
        width: '15%',
        cell: (donation) => donation.date ?? '—',
        skeleton: { width: '70%' },
    },
    {
        key: 'donor',
        header: 'Donor Name',
        width: '30%',
        cell: (donation) => donation.donor_name,
        skeleton: { width: '80%' },
    },
    {
        key: 'project',
        header: 'Project Name',
        width: '40%',
        cell: (donation) => donation.project_name,
        skeleton: { width: '60%' },
    },
    {
        key: 'amount',
        header: 'Amount',
        width: '15%',
        cell: (donation) => `$${donation.amount.toLocaleString()}`,
        skeleton: { width: '55%' },
    },
];

export default function DonationsPage() {
    const api = useApi();

    // Table defaults to mock rows. Only replaced with real API results once
    // the person actually searches, filters, or sorts.
    const [donations, setDonations] = useState<Donation[]>(mockDonations);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const [searchTerm, setSearchTerm] = useState('');
    const [showFilter, setShowFilter] = useState(false);
    const [selectedDonors, setSelectedDonors] = useState<string[]>([]);
    const [showSort, setShowSort] = useState(false);
    const [selectedSort, setSelectedSort] = useState<string>('');

    // Debounced so every keystroke doesn't fire a request.
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const isDefaultState =
            !searchTerm.trim() && selectedDonors.length === 0 && !selectedSort;

        if (isDefaultState) {
            setDonations(mockDonations);
            setError(null);
            setLoading(false);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            try {
                setLoading(true);
                setError(null);

                const params = new URLSearchParams();
                if (searchTerm.trim()) params.set('search', searchTerm.trim());
                if (selectedSort) params.set('sort', selectedSort.toLowerCase());
                if (selectedDonors.length > 0) {
                    // NOTE: assumes the backend accepts donor ids as a
                    // comma-separated list. Names are mapped to their mock
                    // index + 1 here since donor ids aren't fetched from a
                    // real /donors call in this ticket's scope.
                    const donorIds = selectedDonors
                        .map((name) => mockDonors.indexOf(name) + 1)
                        .filter((id) => id > 0);
                    if (donorIds.length > 0) params.set('donor_ids', donorIds.join(','));
                }

                const query = params.toString();
                const res = await api.get<{ data: RawDonation[] }>(
                    `/donations${query ? `?${query}` : ''}`
                );
                const rawDonations = res.data ?? [];

                setDonations(
                    rawDonations.map((d) => ({
                        donation_id: d.donation_id,
                        donor_id: d.donor_id,
                        project_id: d.project_id,
                        donor_name: mockDonors[d.donor_id - 1] ?? 'Unknown Donor',
                        project_name: mockProjects[d.project_id - 1] ?? 'Unknown Project',
                        amount: Number(d.amount),
                        date: d.donated_at ?? null,
                    }))
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load donations');
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, selectedDonors, selectedSort]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedDonors, selectedSort]);

    const totalPages = Math.max(1, Math.ceil(donations.length / rowsPerPage));
    const currentDonations = donations.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const [showNewDonation, setShowNewDonation] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newDonor, setNewDonor] = useState('');
    const [newProject, setNewProject] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [dateError, setDateError] = useState(false);
    const [donorError, setDonorError] = useState(false);
    const [projectError, setProjectError] = useState(false);
    const [amountError, setAmountError] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isFormValid =
        newDate.trim().length > 0 &&
        newDonor.trim().length > 0 &&
        newProject.trim().length > 0 &&
        newAmount.trim().length > 0 &&
        !isNaN(Number(newAmount));

    function resetForm() {
        setNewDate('');
        setNewDonor('');
        setNewProject('');
        setNewAmount('');
        setDateError(false);
        setDonorError(false);
        setProjectError(false);
        setAmountError(false);
        setSubmitError(null);
    }

    const handleSave = async () => {
        const hasDateError = !newDate.trim();
        const hasDonorError = !newDonor.trim();
        const hasProjectError = !newProject.trim();
        const hasAmountError = !newAmount.trim() || isNaN(Number(newAmount));

        setDateError(hasDateError);
        setDonorError(hasDonorError);
        setProjectError(hasProjectError);
        setAmountError(hasAmountError);

        if (hasDateError || hasDonorError || hasProjectError || hasAmountError) return;

        const donorId = mockDonors.indexOf(newDonor) + 1;
        const projectId = mockProjects.indexOf(newProject) + 1;

        if (donorId <= 0 || projectId <= 0) {
            setSubmitError('Select a valid donor and project.');
            return;
        }

        try {
            setSubmitting(true);
            setSubmitError(null);

            // NOTE: /donations expects snake_case. Backend has no donated_at
            // column write yet — newDate is validated client-side only, per
            // the separate ticket tracking that backend change.
            await api.post('/donations', {
                donor_id: donorId,
                project_id: projectId,
                amount: Number(newAmount),
            });

            resetForm();
            setShowNewDonation(false);
            // Table still reads from mocks/current query results — this
            // ticket doesn't refresh the list after adding a donation.
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create donation');
        } finally {
            setSubmitting(false);
        }
    };

    function handleCloseModal() {
        resetForm();
        setShowNewDonation(false);
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <NavBar />
            <main style={{ flex: 1, backgroundColor: '#f9fafb' }}>
                <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '90vh' }}>
                    <h1 style={{ fontWeight: 600, fontFamily: 'var(--font-heading)', fontSize: 'var(--font-size-heading-1)' }}>Donations</h1>
                    <HStack width="100%" justify="space-between" paddingTop="3%" paddingBottom="3%">
                        <HStack width='30%'>
                            <Input
                                placeholder="🔍︎ Search..."
                                variant="outline"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </HStack>
                        <HStack>
                            <div style={{ position: 'relative' }}>
                                <Button
                                    backgroundColor={'var(--color-core-white)'}
                                    color={'var(--color-core-black)'}
                                    border={'1px solid'}
                                    borderColor={'var(--color-black-500)'}
                                    onClick={() => setShowFilter(prev => !prev)}
                                >
                                    <CiFilter />
                                    Filter By Donor
                                    {selectedDonors.length > 0 && ` (${selectedDonors.length})`}
                                </Button>
                                {showFilter && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                                        <DropdownSelector
                                            options={mockDonors}
                                            placeholder="Filter by donor..."
                                            multiSelect={true}
                                            value={selectedDonors}
                                            onChange={(val: string | string[]) => setSelectedDonors(val as string[])}
                                        />
                                    </div>
                                )}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <Button
                                    backgroundColor={'var(--color-core-white)'}
                                    color={'var(--color-core-black)'}
                                    border={'1px solid'}
                                    borderColor={'var(--color-black-500)'}
                                    onClick={() => setShowSort(prev => !prev)}
                                >
                                    <LuArrowDownUp />
                                    Sort By
                                </Button>
                                {showSort && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                                        <DropdownSelector
                                            options={sortOptions}
                                            placeholder="Sort by..."
                                            multiSelect={false}
                                            value={selectedSort}
                                            onChange={(val: string | string[]) => setSelectedSort(val as string)}
                                        />
                                    </div>
                                )}
                            </div>
                            <Button backgroundColor={'var(--color-core-green)'} color={'var(--color-core-white)'} onClick={() => setShowNewDonation(true)}>
                                <FaPlus />
                                New Donation
                            </Button>
                        </HStack>
                    </HStack>

                    <Dialog.Root open={showNewDonation} onOpenChange={(e) => { if (!e.open) handleCloseModal(); }}>
                        <Portal>
                            <Dialog.Backdrop />
                            <Dialog.Positioner>
                                <Dialog.Content>
                                    <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
                                        <Dialog.Title fontFamily={'var(--font-heading)'} fontSize={'var(--font-size-heading-3)'} fontWeight={600}>Add New Donation</Dialog.Title>
                                        <CloseButton onClick={handleCloseModal} />
                                    </Dialog.Header>
                                    <Dialog.Body>
                                        <Stack gap={4}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <label style={{ fontSize: '14px', fontWeight: 500 }}>Date*</label>
                                                <input
                                                    type="date"
                                                    value={newDate}
                                                    onChange={(e) => { setNewDate(e.target.value); setDateError(false); }}
                                                    style={{
                                                        border: `1px solid ${dateError ? 'red' : '#CBD5E0'}`,
                                                        borderRadius: '6px',
                                                        padding: '8px 12px',
                                                        fontSize: '14px',
                                                        outline: 'none',
                                                        width: '100%',
                                                        fontFamily: 'inherit',
                                                        color: newDate ? 'inherit' : '#A0AEC0',
                                                    }}
                                                />
                                                {dateError && <span style={{ color: 'red', fontSize: '12px' }}>Enter a valid date</span>}
                                            </div>
                                            <DropdownSelector
                                                options={mockDonors}
                                                placeholder="Select a donor"
                                                multiSelect={false}
                                                value={newDonor}
                                                onChange={(val: string | string[]) => { setNewDonor(val as string); setDonorError(false); }}
                                            />
                                            {donorError && <span style={{ color: 'red', fontSize: '12px' }}>Select a donor</span>}
                                            <DropdownSelector
                                                options={mockProjects}
                                                placeholder="Select a project"
                                                multiSelect={false}
                                                value={newProject}
                                                onChange={(val: string | string[]) => { setNewProject(val as string); setProjectError(false); }}
                                            />
                                            {projectError && <span style={{ color: 'red', fontSize: '12px' }}>Select a project</span>}
                                            <TextInputField
                                                label="Amount*"
                                                placeholder="Enter the amount"
                                                icon={<FiDollarSign />}
                                                value={newAmount}
                                                onChange={(val) => { setNewAmount(val); setAmountError(false); }}
                                                isError={amountError}
                                                errorMessage="Enter a valid amount"
                                            />
                                            {submitError && (
                                                <p style={{ color: 'var(--color-error-red)', fontSize: '14px' }}>
                                                    {submitError}
                                                </p>
                                            )}
                                        </Stack>
                                    </Dialog.Body>
                                    <Dialog.Footer>
                                        <Button variant="outline" borderColor={'var(--color-core-green)'} onClick={handleCloseModal}>Cancel</Button>
                                        <Button
                                            backgroundColor={isFormValid ? 'var(--color-core-green)' : 'var(--color-primary-500)'}
                                            color={'var(--color-core-white)'}
                                            onClick={handleSave}
                                            disabled={!isFormValid || submitting}
                                            cursor={isFormValid ? 'pointer' : 'not-allowed'}
                                        >
                                            {submitting ? 'Adding…' : 'Add Donation'}
                                        </Button>
                                    </Dialog.Footer>
                                </Dialog.Content>
                            </Dialog.Positioner>
                        </Portal>
                    </Dialog.Root>

                    {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}

                    {!error && (
                        <DataTable
                            columns={donationColumns}
                            rows={currentDonations}
                            rowKey={(donation) => donation.donation_id}
                            isLoading={loading}
                            skeletonRows={rowsPerPage}
                            emptyMessage="No donations found."
                        />
                    )}

                    {!loading && !error && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}