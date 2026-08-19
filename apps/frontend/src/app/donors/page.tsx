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

type Donor = {
    donor_id: number;
    organization: string;
    contact_name: string | null;
    contact_email: string | null;
};
import { useApi } from '@/hooks/useApi';


const donorColumns: DataTableColumn<Donor>[] = [
    {
        key: 'id',
        header: 'Donor ID',
        width: '15%',
        cell: (donor) => `#${String(donor.donor_id).padStart(6, '0')}`,
        skeleton: { width: '80%' },
    },
    { key: 'organization', header: 'Donor Name', width: '35%', cell: (donor) => donor.organization },
    {
        key: 'contact_name',
        header: 'Contact Name',
        width: '25%',
        cell: (donor) => donor.contact_name ?? '—',
        skeleton: { width: '70%' },
    },
    {
        key: 'contact_email',
        header: 'Contact Email',
        width: '25%',
        cell: (donor) => donor.contact_email ?? '—',
        skeleton: { width: '70%' },
    },
];

export default function DonorsPage() {
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const api = useApi();
    const [donors, setDonors] = useState<Donor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchDonors() {
            try {
                const json = await api.get<Donor[] | { data: Donor[] }>('/donors');
                const list = Array.isArray(json) ? json : (json && 'data' in json ? json.data : []);
                setDonors(list);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load donors');
                setDonors([]);
            } finally {
                setLoading(false);
            }
        }
        fetchDonors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalPages = Math.max(1, Math.ceil(donors.length / rowsPerPage));
    const currentDonors = donors.slice(
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
    const donorNames = donors.map(d => d.organization);

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

                    {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}
                    {!error && (
                        <DataTable
                            columns={donorColumns}
                            rows={currentDonors}
                            rowKey={(donor) => donor.donor_id}
                            isLoading={loading}
                            skeletonRows={rowsPerPage}
                            emptyMessage="No donors found."
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
