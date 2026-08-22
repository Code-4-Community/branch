'use client'
import React, { useState } from 'react';
import NavBar from "../components/Navbar";
import { HStack, Input, Button, Dialog, Portal, CloseButton, Stack } from "@chakra-ui/react";
import TextInputField from '../components/TextInputField';
import { LuArrowDownUp } from "react-icons/lu";
import { FaPlus } from "react-icons/fa";
import DataTable, { type DataTableColumn } from '../components/DataTable';
import Pagination from '../components/Pagination';
import { MdOutlineMail } from "react-icons/md";
import { useApi } from '@/hooks/useApi';

type Donor = {
    donor_id: number;
    organization: string;
    contact_name: string | null;
    contact_email: string | null;
    num_projects: number;
    last_donation: string | null;
};

/** Raw shape of a row from GET /donors — no computed fields yet. */
interface RawDonor {
    donor_id: number;
    organization: string;
    contact_name: string | null;
    contact_email: string | null;
}

/** Raw shape of a row from GET /donations. */
interface RawDonation {
    donation_id: number;
    donor_id: number;
    project_id: number;
    amount: string;
    donated_at: string;
}

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
        key: 'contact_name',
        header: 'Contact Name',
        width: '15%',
        cell: (donor) => donor.contact_name,
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
    const api = useApi();

    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    
    // Sort by last donated.
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

    // Sorted view — does not mutate donors list, so re-sorting or clearing the
    // sort never loses the original order.
    const sortedDonors = React.useMemo(() => {
        if (!sortDirection) return mockDonors;
        const withDates = [...mockDonors];
        withDates.sort((a, b) => {
            const aTime = a.last_donation ? new Date(a.last_donation).getTime() : 0;
            const bTime = b.last_donation ? new Date(b.last_donation).getTime() : 0;
            return sortDirection === 'desc' ? bTime - aTime : aTime - bTime;
        });
        return withDates;
    }, [sortDirection]);


    const totalPages = Math.max(1, Math.ceil(sortedDonors.length / rowsPerPage));
    const currentDonors = sortedDonors.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    // Toggling re-sorts on every click: most recent first, then oldest first,
    // then back to the original mock order.
    function handleSortByLastDonated() {
        setSortDirection((prev) => (prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc'));
        setCurrentPage(1);
    }

    const [showNewDonor, setShowNewDonor] = useState(false);
    const [newOrganization, setNewOrganization] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [orgError, setOrgError] = useState(false);
    const [nameError, setNameError] = useState(false);
    const [emailError, setEmailError] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const isFormValid =
        newOrganization.trim().length > 0 &&
        newContactName.trim().length > 0 &&
        newContactEmail.trim().length > 0;

    function resetForm() {
        setNewOrganization('');
        setNewContactName('');
        setNewContactEmail('');
        setOrgError(false);
        setNameError(false);
        setEmailError(false);
        setSubmitError(null);
    }

    const handleSave = async () => {
        const hasOrgError = !newOrganization.trim();
        const hasNameError = !newContactName.trim();
        const hasEmailError = !newContactEmail.trim();
 
        setOrgError(hasOrgError);
        setNameError(hasNameError);
        setEmailError(hasEmailError);
 
        if (hasOrgError || hasNameError || hasEmailError) return;
 
        try {
            setSubmitting(true);
            setSubmitError(null);
 
            // NOTE: backend expects snake_case for these two fields.
            await api.post('/donors', {
                organization: newOrganization.trim(),
                contact_name: newContactName.trim(),
                contact_email: newContactEmail.trim(),
            });
 
            resetForm();
            setShowNewDonor(false);
            // Table still reads from mockDonors — another dev is wiring up
            // the real GET /donors refresh here.
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create donor');
        } finally {
            setSubmitting(false);
        }
    };

    function handleCloseModal() {
        resetForm();
        setShowNewDonor(false);
    }

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
                            <Button
                                backgroundColor={'var(--color-core-white)'}
                                color={'var(--color-core-black)'}
                                border={'1px solid'}
                                borderColor={'var(--color-black-500)'}
                                onClick={handleSortByLastDonated}
                            >
                                <LuArrowDownUp />
                                Last Donated
                                {sortDirection === 'desc' && ' ↓'}
                                {sortDirection === 'asc' && ' ↑'}
                            </Button>
                            <Button backgroundColor={'var(--color-core-green)'} color={'var(--color-core-white)'} onClick={() => setShowNewDonor(true)}>
                                <FaPlus />
                                New Donor
                            </Button>
                        </HStack>
                    </HStack>
 
                    <Dialog.Root open={showNewDonor} onOpenChange={(e) => { if (!e.open) handleCloseModal(); }}>
                        <Portal>
                            <Dialog.Backdrop />
                            <Dialog.Positioner>
                                <Dialog.Content>
                                    <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
                                        <Dialog.Title fontFamily={'var(--font-heading)'} fontSize={'var(--font-size-heading-3)'} fontWeight={600}>Add New Donor</Dialog.Title>
                                        <CloseButton onClick={handleCloseModal} />
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
                                                icon={<MdOutlineMail />}
                                                value={newContactEmail}
                                                onChange={(val) => { setNewContactEmail(val); setEmailError(false); }}
                                                isError={emailError}
                                                errorMessage="Enter valid email"
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
                                            {submitting ? 'Adding…' : 'Add Donor'}
                                        </Button>
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
