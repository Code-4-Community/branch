'use client'
import React, { useEffect, useState } from 'react';
import NavBar from "../components/Navbar";
import { HStack, Input, Button, Dialog, Portal, CloseButton, Stack } from "@chakra-ui/react";
import TextInputField from '../components/TextInputField';
import { CiFilter } from "react-icons/ci";
import { LuArrowDownUp } from "react-icons/lu";
import { FaPlus, FaAngleLeft, FaAngleRight } from "react-icons/fa";
import DropdownSelector from '../components/DropdownSelector';
import DataTable, { type DataTableColumn } from '../components/DataTable';

type Donation = {
    donor_id: number;
    date: string | null;
    project_name: string;
    amount: number;
};
import { useApi } from '@/hooks/useApi';

const donorsBase = 'http://localhost:3003';
const projectsBase = 'http://localhost:3002';


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
        header: 'Donor ID',
        width: '15%',
        cell: (donation) => `#${String(donation.donor_id).padStart(6, '0')}`,
        skeleton: { width: '80%' },
    },
    { key: 'project', header: 'Project Name', width: '55%', cell: (donation) => donation.project_name },
    {
        key: 'amount',
        header: 'Amount',
        width: '15%',
        cell: (donation) => `$${donation.amount.toLocaleString()}`,
        skeleton: { width: '55%' },
    },
];

export default function DonationsPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const api = useApi();
    const [donations, setDonations] = useState<Donation[]>([]);
    const [donorNames, setDonorNames] = useState<string[]>([]);
    const [projectNames, setProjectNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAll() {
            try {
                const [donationsJson, donorsJson, projectsJson] = await Promise.all([
                    api.get<Donation[] | { data: Donation[] }>(`${donorsBase}/donations`),
                    api.get<string[] | { data: unknown[] }>(`${donorsBase}/donors`),
                    api.get<string[] | { data: unknown[] }>(`${projectsBase}/projects`),
                ]);

                const dList = Array.isArray(donationsJson) ? donationsJson : (donationsJson && 'data' in donationsJson ? donationsJson.data : []);
                const dn = Array.isArray(donorsJson) ? donorsJson : (donorsJson && 'data' in donorsJson ? donorsJson.data : []);
                const pn = Array.isArray(projectsJson) ? projectsJson : (projectsJson && 'data' in projectsJson ? projectsJson.data : []);

                setDonations(dList);
                // donors API may return objects; if so map to organization names
                const dnArray: unknown[] = dn as unknown[];
                const donorNamesMapped = dnArray
                    .map((d) => {
                        if (typeof d === 'string') return d;
                        if (d && typeof d === 'object' && 'organization' in d) {
                            const maybeOrg = (d as { [key: string]: unknown })['organization'];
                            if (typeof maybeOrg === 'string') return maybeOrg;
                        }
                        return '';
                    })
                    .filter((s): s is string => Boolean(s));

                const pnArray: unknown[] = pn as unknown[];
                const projectNamesMapped = pnArray
                    .map((p) => {
                        if (typeof p === 'string') return p;
                        if (p && typeof p === 'object' && 'name' in p) {
                            const maybeName = (p as { [key: string]: unknown })['name'];
                            if (typeof maybeName === 'string') return maybeName;
                        }
                        return '';
                    })
                    .filter((s): s is string => Boolean(s));

                setDonorNames(donorNamesMapped);
                setProjectNames(projectNamesMapped);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load donations data');
                setDonations([]);
                setDonorNames([]);
                setProjectNames([]);
            } finally {
                setLoading(false);
            }
        }
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalPages = Math.max(1, Math.ceil(donations.length / rowsPerPage));
    const currentDonations = donations.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const getPageNumbers = (): Array<number | '...'> => {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
        if (currentPage <= 3) return [1, 2, 3, '...', totalPages];
        if (currentPage >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    };

    const [showFilter, setShowFilter] = useState(false);
    const [selectedDonor, setSelectedDonor] = useState<string>('');
    const [showSort, setShowSort] = useState(false);
    const [selectedSort, setSelectedSort] = useState<string>('');
    const sortOptions = ['Date', 'Amount'];

    const [showNewDonation, setShowNewDonation] = useState(false);
    const [newDate, setNewDate] = useState('');
    const [newDonor, setNewDonor] = useState('');
    const [newProject, setNewProject] = useState('');
    const [newAmount, setNewAmount] = useState('');
    const [dateError, setDateError] = useState(false);
    const [donorError, setDonorError] = useState(false);
    const [projectError, setProjectError] = useState(false);
    const [amountError, setAmountError] = useState(false);

    const handleSave = () => {
        const hasDateError = !newDate.trim();
        const hasDonorError = !newDonor.trim();
        const hasProjectError = !newProject.trim();
        const hasAmountError = !newAmount.trim() || isNaN(Number(newAmount));

        setDateError(hasDateError);
        setDonorError(hasDonorError);
        setProjectError(hasProjectError);
        setAmountError(hasAmountError);

        if (hasDateError || hasDonorError || hasProjectError || hasAmountError) return;
        setShowNewDonation(false);
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <NavBar />
            <main style={{ flex: 1, backgroundColor: '#f9fafb' }}>
                <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '90vh' }}>
                    <h1 style={{ fontWeight: 600, fontFamily: 'var(--font-heading)', fontSize: 'var(--font-size-heading-1)' }}>Donations</h1>
                    <HStack width="100%" justify="space-between" paddingTop="3%" paddingBottom="3%">
                        <HStack width='30%'>
                            <Input placeholder="🔍︎ Search..." variant="outline" />
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
                                </Button>
                                {showFilter && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10 }}>
                                        <DropdownSelector
                                            options={donorNames}
                                            placeholder="Filter by donor..."
                                            multiSelect={true}
                                            value={selectedDonor}
                                            onChange={(val: string | string[]) => setSelectedDonor(val as string)}
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

                    <Dialog.Root open={showNewDonation} onOpenChange={(e) => setShowNewDonation(e.open)}>
                        <Portal>
                            <Dialog.Backdrop />
                            <Dialog.Positioner>
                                <Dialog.Content>
                                    <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
                                        <Dialog.Title fontFamily={'var(--font-heading)'} fontSize={'var(--font-size-heading-3)'} fontWeight={600}>Add New Donation</Dialog.Title>
                                        <CloseButton onClick={() => setShowNewDonation(false)} />
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
                                                options={donorNames}
                                                placeholder="Select a donor"
                                                multiSelect={false}
                                                value={newDonor}
                                                onChange={(val: string | string[]) => { setNewDonor(val as string); setDonorError(false); }}
                                            />
                                            {donorError && <span style={{ color: 'red', fontSize: '12px' }}>Select a donor</span>}
                                            <DropdownSelector
                                                options={projectNames}
                                                placeholder="Select a project"
                                                multiSelect={false}
                                                value={newProject}
                                                onChange={(val: string | string[]) => { setNewProject(val as string); setProjectError(false); }}
                                            />
                                            {projectError && <span style={{ color: 'red', fontSize: '12px' }}>Select a project</span>}
                                            <TextInputField
                                                label="Amount*"
                                                placeholder="Enter the amount"
                                                value={newAmount}
                                                onChange={(val) => { setNewAmount(val); setAmountError(false); }}
                                                isError={amountError}
                                                errorMessage="Enter a valid amount"
                                            />
                                        </Stack>
                                    </Dialog.Body>
                                    <Dialog.Footer>
                                        <Button variant="outline" borderColor={'var(--color-core-green)'} onClick={() => setShowNewDonation(false)}>Cancel</Button>
                                        <Button backgroundColor={'var(--color-core-green)'} color={'var(--color-core-white)'} onClick={handleSave}>Add Donation</Button>
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
                            rowKey={(donation) => donation.donor_id}
                            isLoading={loading}
                            skeletonRows={rowsPerPage}
                            emptyMessage="No donations found."
                        />
                    )}
                    <HStack width="100%" justify="center" paddingTop="3%" paddingBottom="3%" gap="6">
                        <FaAngleLeft
                            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                            style={{ cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.3 : 1, color: 'var(--color-core-green)' }}
                        />
                        {getPageNumbers().map((page, index) => (
                            page === '...'
                                ? <Button key={`ellipsis-${index}`} backgroundColor="var(--color-core-white)" color="var(--color-core-green)" border="1px solid" borderColor="var(--color-core-green)" cursor="default">...</Button>
                                : <Button key={page} onClick={() => setCurrentPage(page as number)} backgroundColor={currentPage === page ? 'var(--color-core-green)' : 'var(--color-core-white)'} color={currentPage === page ? 'var(--color-core-white)' : 'var(--color-core-green)'} border="1px solid" borderColor="var(--color-core-green)">{page}</Button>
                        ))}
                        <FaAngleRight
                            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
                            style={{ cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.3 : 1, color: 'var(--color-core-green)' }}
                        />
                    </HStack>
                </div>
            </main>
        </div>
    );
}
