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

type Donor = {
    donor_id: number;
    organization: string;
    contact_name: string | null;
    contact_email: string | null;
    num_projects: number;
    last_donation: string | null;
};

const mockDonors: Donor[] = [
    { donor_id: 1, organization: 'Green Future Foundation', contact_name: 'Alice Chen', contact_email: 'alice@greenfuture.org', num_projects: 4, last_donation: '03/12/2024' },
    { donor_id: 2, organization: 'Horizon Trust', contact_name: 'James Patel', contact_email: 'james@horizontrust.org', num_projects: 2, last_donation: '01/05/2024' },
    { donor_id: 3, organization: 'Bright Path Nonprofit', contact_name: null, contact_email: null, num_projects: 7, last_donation: '02/28/2024' },
    { donor_id: 4, organization: 'Unity Giving Circle', contact_name: 'Maria Lopez', contact_email: 'maria@unitygiving.org', num_projects: 1, last_donation: '03/30/2024' },
    { donor_id: 5, organization: 'Sunrise Community Fund', contact_name: 'David Kim', contact_email: 'david@sunrisefund.org', num_projects: 3, last_donation: '04/01/2024' },
    { donor_id: 6, organization: 'Blue Ridge Giving', contact_name: 'Sarah Thompson', contact_email: 'sarah@blueridge.org', num_projects: 5, last_donation: '02/14/2024' },
    { donor_id: 7, organization: 'Maple Leaf Charitable Trust', contact_name: null, contact_email: null, num_projects: 2, last_donation: '01/20/2024' },
    { donor_id: 8, organization: 'Evergreen Partners', contact_name: 'Rachel Singh', contact_email: 'rachel@evergreenpartners.org', num_projects: 6, last_donation: '03/05/2024' },
    { donor_id: 9, organization: 'New Horizons Society', contact_name: 'Tom Bradley', contact_email: 'tom@newhorizons.org', num_projects: 9, last_donation: '04/10/2024' },
    { donor_id: 10, organization: 'Coastal Care Foundation', contact_name: 'Nina Rossi', contact_email: 'nina@coastalcare.org', num_projects: 3, last_donation: '03/22/2024' },
];

const donorColumns: DataTableColumn<Donor>[] = [
    {
        key: 'id',
        header: 'Donor ID',
        width: '15%',
        cell: (donor) => `#${String(donor.donor_id).padStart(6, '0')}`,
        skeleton: { width: '80%' },
    },
    { key: 'organization', header: 'Donor Name', width: '55%', cell: (donor) => donor.organization },
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
        cell: (donor) => donor.last_donation ?? '—',
        skeleton: { width: '70%' },
    },
];

export default function DonorsPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const totalPages = Math.ceil(mockDonors.length / rowsPerPage);
    const currentDonors = mockDonors.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const [showFilter, setShowFilter] = useState(false);
    const [selectedDonor, setSelectedDonor] = useState<string>('');
    const donorNames = mockDonors.map(d => d.organization);

    const [showSort, setShowSort] = useState(false);
    const [selectedSort, setSelectedSort] = useState<string>('');
    const sortOptions = ['# of Projects', 'Last Donated'];

    const [showNewDonor, setShowNewDonor] = useState(false);
    const [newOrganization, setNewOrganization] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [orgError, setOrgError] = useState(false);
    const [nameError, setNameError] = useState(false);
    const [emailError, setEmailError] = useState(false);

    const handleSave = () => {
        const hasOrgError = !newOrganization.trim();
        const hasNameError = !newContactName.trim();
        const hasEmailError = !newContactEmail.trim();

        setOrgError(hasOrgError);
        setNameError(hasNameError);
        setEmailError(hasEmailError);

        if (hasOrgError || hasNameError || hasEmailError) return;
        setShowNewDonor(false);
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            <NavBar />
            <main style={{ flex: 1, backgroundColor: '#f9fafb' }}>
                <div style={{ margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '90vh' }}>
                    <h1 style={{ fontWeight: 600, fontFamily: 'var(--font-heading)', fontSize: 'var(--font-size-heading-1)' }}>Donors</h1>
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
                                    Filter By
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
                                            multiSelect={true}
                                            value={selectedSort}
                                            onChange={(val: string | string[]) => setSelectedSort(val as string)}
                                        />
                                    </div>
                                )}
                            </div>
                            <Button backgroundColor={'var(--color-core-green)'} color={'var(--color-core-white)'} onClick={() => setShowNewDonor(true)}>
                                <FaPlus />
                                New Donor
                            </Button>
                        </HStack>
                    </HStack>

                    <Dialog.Root open={showNewDonor} onOpenChange={(e) => setShowNewDonor(e.open)}>
                        <Portal>
                            <Dialog.Backdrop />
                            <Dialog.Positioner>
                                <Dialog.Content>
                                    <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
                                        <Dialog.Title fontFamily={'var(--font-heading)'} fontSize={'var(--font-size-heading-3)'} fontWeight={600}>Add New Donor</Dialog.Title>
                                        <CloseButton onClick={() => setShowNewDonor(false)} />
                                    </Dialog.Header>
                                    <Dialog.Body>
                                        <Stack gap={4}>
                                            <TextInputField
                                                label="Organization Name*"
                                                placeholder="Organization name"
                                                value={newOrganization}
                                                onChange={(val) => { setNewOrganization(val); setOrgError(false); }}
                                                isError={orgError}
                                                errorMessage="Enter valid name"
                                            />
                                            <TextInputField
                                                label="Contact Name*"
                                                placeholder="Contact name"
                                                value={newContactName}
                                                onChange={(val) => { setNewContactName(val); setNameError(false); }}
                                                isError={nameError}
                                                errorMessage="Enter valid name"
                                            />
                                            <TextInputField
                                                label="Contact Email*"
                                                placeholder="Contact email"
                                                value={newContactEmail}
                                                onChange={(val) => { setNewContactEmail(val); setEmailError(false); }}
                                                isError={emailError}
                                                errorMessage="Enter valid email"
                                            />
                                        </Stack>
                                    </Dialog.Body>
                                    <Dialog.Footer>
                                        <Button variant="outline" borderColor={'var(--color-core-green)'} onClick={() => setShowNewDonor(false)}>Cancel</Button>
                                        <Button backgroundColor={'var(--color-core-green)'} color={'var(--color-core-white)'} onClick={handleSave}>Add Donor</Button>
                                    </Dialog.Footer>
                                </Dialog.Content>
                            </Dialog.Positioner>
                        </Portal>
                    </Dialog.Root>

                    <DataTable
                        columns={donorColumns}
                        rows={currentDonors}
                        rowKey={(donor) => donor.donor_id}
                        emptyMessage="No donors found."
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
