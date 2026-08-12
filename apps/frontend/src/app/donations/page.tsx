'use client'
import React, { useState } from 'react';
import NavBar from "../components/Navbar";
import { HStack, Input, Button, Dialog, Portal, CloseButton, Stack } from "@chakra-ui/react";
import TextInputField from '../components/TextInputField';
import { CiFilter } from "react-icons/ci";
import { LuArrowDownUp } from "react-icons/lu";
import { FaPlus } from "react-icons/fa";
import DropdownSelector from '../components/DropdownSelector';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Pagination from '../components/Pagination';

type Donation = {
    donor_id: number;
    date: string | null;
    project_name: string;
    amount: number;
};

const mockDonors = ['Green Future Foundation', 'Horizon Trust', 'Bright Path Nonprofit', 'Unity Giving Circle', 'Sunrise Community Fund'];
const mockProjects = ['Clean Water Initiative', 'Youth Mentorship Program', 'Food Security Drive', 'Urban Garden Project', 'STEM Education Fund'];

const mockDonations: Donation[] = [
    { donor_id: 1, date: '03/12/2024', project_name: 'Clean Water Initiative', amount: 5000 },
    { donor_id: 2, date: '01/05/2024', project_name: 'Youth Mentorship Program', amount: 12000 },
    { donor_id: 3, date: '02/28/2024', project_name: 'Food Security Drive', amount: 750 },
    { donor_id: 4, date: '03/30/2024', project_name: 'Urban Garden Project', amount: 3200 },
    { donor_id: 5, date: '04/01/2024', project_name: 'STEM Education Fund', amount: 8500 },
    { donor_id: 6, date: '02/14/2024', project_name: 'Shelter Renovation', amount: 1500 },
    { donor_id: 7, date: '01/20/2024', project_name: 'Mental Health Outreach', amount: 20000 },
    { donor_id: 8, date: '03/05/2024', project_name: 'Digital Literacy Program', amount: 9750 },
    { donor_id: 9, date: '04/10/2024', project_name: 'Community Health Fair', amount: 4300 },
    { donor_id: 10, date: '03/22/2024', project_name: 'After-School Arts', amount: 600 },
];

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

    const totalPages = Math.ceil(mockDonations.length / rowsPerPage);
    const currentDonations = mockDonations.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

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
                                            options={mockDonors}
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

                    <DataTable
                        columns={donationColumns}
                        rows={currentDonations}
                        rowKey={(donation) => donation.donor_id}
                        emptyMessage="No donations found."
                    />

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </main>
        </div>
    );
}
