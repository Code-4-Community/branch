'use client'
import React, { useState } from 'react';
import { HStack, Input, Button, Table, Heading, Dialog, Portal, CloseButton, Stack } from "@chakra-ui/react";
import TextInputField from './components/TextInputField';
import { CiFilter } from "react-icons/ci";
import { LuArrowDownUp } from "react-icons/lu";
import { FaPlus, FaAngleLeft, FaAngleRight } from "react-icons/fa";
import DropdownSelector from './components/DropdownSelector';
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
    { donor_id: 11, organization: 'Valley Hope Fund', contact_name: 'Carlos Rivera', contact_email: 'carlos@valleyhope.org', num_projects: 2, last_donation: '02/08/2024' },
    { donor_id: 12, organization: 'Summit Philanthropy Group', contact_name: null, contact_email: null, num_projects: 4, last_donation: '01/30/2024' },
    { donor_id: 13, organization: 'Harbor Light Charity', contact_name: 'Emily Nguyen', contact_email: 'emily@harborlight.org', num_projects: 8, last_donation: '03/17/2024' },
    { donor_id: 14, organization: 'Prairie Roots Foundation', contact_name: 'Michael Scott', contact_email: 'michael@praireroots.org', num_projects: 1, last_donation: '04/05/2024' },
    { donor_id: 15, organization: 'Starlight Endowment', contact_name: 'Laura White', contact_email: 'laura@starlightend.org', num_projects: 5, last_donation: '02/25/2024' },
    { donor_id: 16, organization: 'Redwood Community Trust', contact_name: 'Kevin Park', contact_email: 'kevin@redwoodtrust.org', num_projects: 3, last_donation: '03/09/2024' },
    { donor_id: 17, organization: 'Silver Lining Fund', contact_name: null, contact_email: null, num_projects: 6, last_donation: '01/15/2024' },
    { donor_id: 18, organization: 'Lakeside Giving Circle', contact_name: 'Amanda Foster', contact_email: 'amanda@lakesidegiving.org', num_projects: 2, last_donation: '04/02/2024' },
    { donor_id: 19, organization: 'Northstar Charitable Fund', contact_name: 'Brian Walsh', contact_email: 'brian@northstarfund.org', num_projects: 7, last_donation: '03/28/2024' },
    { donor_id: 20, organization: 'Desert Bloom Foundation', contact_name: 'Priya Mehta', contact_email: 'priya@desertbloom.org', num_projects: 4, last_donation: '02/19/2024' },
    { donor_id: 21, organization: 'Willow Creek Society', contact_name: 'Jason Turner', contact_email: 'jason@willowcreek.org', num_projects: 3, last_donation: '03/14/2024' },
    { donor_id: 22, organization: 'Ironwood Philanthropy', contact_name: null, contact_email: null, num_projects: 5, last_donation: '01/25/2024' },
    { donor_id: 23, organization: 'Clearwater Endowment', contact_name: 'Sophia Adams', contact_email: 'sophia@clearwaterend.org', num_projects: 2, last_donation: '04/07/2024' },
    { donor_id: 24, organization: 'Goldfinch Foundation', contact_name: 'Daniel Lee', contact_email: 'daniel@goldfinchfdn.org', num_projects: 9, last_donation: '03/01/2024' },
    { donor_id: 25, organization: 'Meadowbrook Trust', contact_name: 'Hannah Clark', contact_email: 'hannah@meadowbrook.org', num_projects: 1, last_donation: '02/11/2024' },
    { donor_id: 26, organization: 'Tidewater Giving Fund', contact_name: 'Marcus Hill', contact_email: 'marcus@tidewaterfund.org', num_projects: 4, last_donation: '03/20/2024' },
    { donor_id: 27, organization: 'Pinecrest Charitable Trust', contact_name: null, contact_email: null, num_projects: 6, last_donation: '01/10/2024' },
    { donor_id: 28, organization: 'Foxglove Foundation', contact_name: 'Olivia Martin', contact_email: 'olivia@foxglovefdn.org', num_projects: 3, last_donation: '04/14/2024' },
    { donor_id: 29, organization: 'Stonegate Philanthropy', contact_name: 'Ethan Brooks', contact_email: 'ethan@stonegatephil.org', num_projects: 7, last_donation: '02/03/2024' },
    { donor_id: 30, organization: 'Riverview Society', contact_name: 'Isabella Young', contact_email: 'isabella@riverviewsoc.org', num_projects: 2, last_donation: '03/25/2024' },
    { donor_id: 31, organization: 'Thunderbird Fund', contact_name: 'Noah Perez', contact_email: 'noah@thunderbirdfund.org', num_projects: 5, last_donation: '01/28/2024' },
    { donor_id: 32, organization: 'Aspen Grove Foundation', contact_name: null, contact_email: null, num_projects: 8, last_donation: '04/09/2024' },
    { donor_id: 33, organization: 'Brightwater Giving', contact_name: 'Chloe Evans', contact_email: 'chloe@brightwatergiving.org', num_projects: 1, last_donation: '03/06/2024' },
    { donor_id: 34, organization: 'Cedarwood Endowment', contact_name: 'Liam Robinson', contact_email: 'liam@cedarwoodend.org', num_projects: 4, last_donation: '02/22/2024' },
    { donor_id: 35, organization: 'Moonstone Charitable Trust', contact_name: 'Ava Mitchell', contact_email: 'ava@moonstonetrust.org', num_projects: 3, last_donation: '03/31/2024' },
    { donor_id: 36, organization: 'Harborview Partners', contact_name: 'Mason Carter', contact_email: 'mason@harborviewpartners.org', num_projects: 6, last_donation: '01/18/2024' },
    { donor_id: 37, organization: 'Cloverfield Foundation', contact_name: null, contact_email: null, num_projects: 2, last_donation: '04/03/2024' },
    { donor_id: 38, organization: 'Sycamore Hill Trust', contact_name: 'Emma Phillips', contact_email: 'emma@sycamorehill.org', num_projects: 7, last_donation: '02/16/2024' },
    { donor_id: 39, organization: 'Falcon Ridge Fund', contact_name: 'William Turner', contact_email: 'william@falconridge.org', num_projects: 4, last_donation: '03/13/2024' },
    { donor_id: 40, organization: 'Whitestone Giving Circle', contact_name: 'Mia Campbell', contact_email: 'mia@whitestonegiving.org', num_projects: 5, last_donation: '01/07/2024' },
    { donor_id: 41, organization: 'Birchwood Society', contact_name: 'James Nelson', contact_email: 'james@birchwoodsoc.org', num_projects: 3, last_donation: '04/11/2024' },
    { donor_id: 42, organization: 'Ember Light Foundation', contact_name: null, contact_email: null, num_projects: 9, last_donation: '02/27/2024' },
    { donor_id: 43, organization: 'Saltgrass Endowment', contact_name: 'Charlotte Baker', contact_email: 'charlotte@saltgrassend.org', num_projects: 2, last_donation: '03/04/2024' },
    { donor_id: 44, organization: 'Ironstone Philanthropy', contact_name: 'Henry Gonzalez', contact_email: 'henry@ironstonephil.org', num_projects: 6, last_donation: '01/23/2024' },
    { donor_id: 45, organization: 'Dawnwood Trust', contact_name: 'Amelia Scott', contact_email: 'amelia@dawnwoodtrust.org', num_projects: 1, last_donation: '04/08/2024' },
    { donor_id: 46, organization: 'Copperleaf Fund', contact_name: 'Benjamin Harris', contact_email: 'benjamin@copperleaffund.org', num_projects: 4, last_donation: '03/19/2024' },
    { donor_id: 47, organization: 'Snowcap Foundation', contact_name: null, contact_email: null, num_projects: 3, last_donation: '02/06/2024' },
    { donor_id: 48, organization: 'Thornberry Giving', contact_name: 'Ella Walker', contact_email: 'ella@thornberrygiving.org', num_projects: 7, last_donation: '03/26/2024' },
    { donor_id: 49, organization: 'Granite Peak Society', contact_name: 'Alexander Hall', contact_email: 'alexander@granitepeak.org', num_projects: 5, last_donation: '01/31/2024' },
    { donor_id: 50, organization: 'Wren Valley Foundation', contact_name: 'Sofia Allen', contact_email: 'sofia@wrenvalley.org', num_projects: 2, last_donation: '04/15/2024' },
];

export default function Donors() {

    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    const totalPages = Math.ceil(mockDonors.length / rowsPerPage);
    const currentDonors = mockDonors.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const getPageNumbers = () => {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
        
        if (currentPage <= 3) return [1, 2, 3, '...', totalPages];
        if (currentPage >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    };

    const [showFilter, setShowFilter] = useState(false);
    const [selectedDonor, setSelectedDonor] = useState<string>('');
    const donorNames = mockDonors.map(d => d.organization);

    const [showSort, setShowSort] = useState(false);
    const[selectedSort, setSelectedSort] = useState<string>('');
    const sortOptions = ['# of Projects', 'Last Donated']

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

        // need to implement the save logic later (like saving it to the db)
    
        setShowNewDonor(false);
    };

    return (
        <div style={{margin: '2%', display: 'flex', flexDirection: 'column', minHeight: '90vh'}}>
            <Heading fontWeight={600} fontFamily={'var(--font-heading)'} fontSize={'var(--font-size-heading-1)'}>Donors</Heading>
            <HStack width="100%" justify="space-between" paddingTop="3%" paddingBottom="3%">            
                <HStack width='30%'>
                    <Input placeholder="🔍︎ Search..." variant="outline"/>
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
                                    onChange={(val) => setSelectedDonor(val as string)}
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
                                    onChange={(val) => setSelectedSort(val as string)}
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

            <Table.Root>
                <Table.ColumnGroup>
                    <Table.Column width="15%" />
                    <Table.Column width="55%" />
                    <Table.Column width="15%" />
                    <Table.Column width="15%" />
                </Table.ColumnGroup>

                <Table.Header>
                    <Table.Row backgroundColor={'var(--color-primary-800)'}>
                        <Table.ColumnHeader color={'var(--color-core-white)'}>Donor ID</Table.ColumnHeader>
                        <Table.ColumnHeader color={'var(--color-core-white)'}>Donor Name</Table.ColumnHeader>
                        <Table.ColumnHeader color={'var(--color-core-white)'}># of Projects</Table.ColumnHeader>
                        <Table.ColumnHeader color={'var(--color-core-white)'}>Last Donation</Table.ColumnHeader>
                    </Table.Row>
                </Table.Header>

                <Table.Body>
                    {currentDonors.map((donor) => (
                        <Table.Row key={donor.donor_id}>
                            <Table.Cell>#{String(donor.donor_id).padStart(6, '0')}</Table.Cell>
                            <Table.Cell>{donor.organization}</Table.Cell>
                            <Table.Cell>{donor.num_projects}</Table.Cell>
                            <Table.Cell>{donor.last_donation ?? '—'}</Table.Cell>
                        </Table.Row>
                    ))}
                </Table.Body>

            </Table.Root>
            
            <div style={{ marginTop: 'auto' }}>
                <HStack width="100%" justify="center" paddingTop="3%" paddingBottom="3%" gap="6">
                    <FaAngleLeft 
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    style={{ cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.3 : 1, color: 'var(--color-core-green)' }}
                    /> 
                    {getPageNumbers().map((page, index) => (
                        page === '...'
                            ? <Button
                                key={`ellipsis-${index}`}
                                backgroundColor={'var(--color-core-white)'}
                                color={'var(--color-core-green)'}
                                border={'1px solid'}
                                borderColor={'var(--color-core-green)'}
                                cursor={'default'}
                                > ... </Button>
                            : <Button
                                key={page}
                                onClick={() => setCurrentPage(page as number)}
                                backgroundColor={currentPage === page ? 'var(--color-core-green)' : 'var(--color-core-white)'}
                                color={currentPage === page ? 'var(--color-core-white)' : 'var(--color-core-green)'}
                                border={'1px solid'}
                                borderColor={'var(--color-core-green)'}
                            >
                                {page}
                            </Button>
                    ))}
                    <FaAngleRight
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                        style={{ cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.3 : 1, color: 'var(--color-core-green)' }}
                    />
                </HStack>
            </div>
        </div>
    )
}